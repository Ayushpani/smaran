import { schema, type Db } from "@repo/db"
import { and, count, desc, eq, isNull } from "drizzle-orm"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { type ApiKeyAuth, auth, hashKey } from "../auth.ts"
import { validate } from "../http.ts"
import type { QuotaGuard } from "../quota.ts"

/**
 * Self-serve accounts.
 *   POST   /v1/signup        public — new tenant + first API key
 *   GET    /v1/keys          list this tenant's keys
 *   POST   /v1/keys          create a key (raw key shown once)
 *   DELETE /v1/keys/:id      revoke a key (never the last active one)
 *   GET    /v1/usage         plan, memory count and limits
 */

export interface SignupConfig {
	mode: "off" | "invite" | "open"
	freeMemoryQuota: number
	freeRateLimitPerMinute: number
}

export const signupInput = z.object({
	name: z.string().trim().min(1).max(120),
	email: z.string().trim().email().max(254).optional(),
	invite: z.string().trim().min(1).max(200).optional(),
})
export const createKeyInput = z.object({
	label: z.string().trim().max(100).optional(),
})
export const keyParams = z.object({ id: z.string().min(1).max(100) })

function randomHex(bytes: number): string {
	const a = new Uint8Array(bytes)
	crypto.getRandomValues(a)
	return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")
}

async function issueKey(db: Db, tenantId: string, label: string | null) {
	const raw = `sk_${randomHex(24)}`
	const id = `key_${randomHex(8)}`
	await db
		.insert(schema.apiKeys)
		.values({ id, tenantId, hashedKey: await hashKey(raw), label })
	return { id, apiKey: raw }
}

/** Public: mounted before API-key auth. */
export function signupRouter(db: Db, cfg: SignupConfig) {
	return new Hono().post("/", validate("json", signupInput), async (c) => {
		if (cfg.mode === "off")
			throw new HTTPException(403, {
				message: "signup is disabled on this server",
			})
		const body = c.req.valid("json")
		if (cfg.mode === "invite" && !body.invite) {
			throw new HTTPException(403, { message: "an invite code is required" })
		}
		const tenantId = `ten_${randomHex(8)}`
		const key = await db.transaction(async (tx) => {
			await tx.insert(schema.tenants).values({
				id: tenantId,
				name: body.name,
				contactEmail: body.email ?? null,
				plan: "free",
				memoryQuota: cfg.freeMemoryQuota,
				rateLimitPerMinute: cfg.freeRateLimitPerMinute,
			})
			if (cfg.mode === "invite") {
				// Single use, atomically: only an unused code flips to used.
				const used = await tx
					.update(schema.invites)
					.set({ usedAt: new Date(), tenantId })
					.where(
						and(
							eq(schema.invites.codeHash, await hashKey(body.invite!)),
							isNull(schema.invites.usedAt),
						),
					)
					.returning({ codeHash: schema.invites.codeHash })
				if (used.length === 0)
					throw new HTTPException(403, {
						message: "invalid or already used invite code",
					})
			}
			return issueKey(tx as unknown as Db, tenantId, "initial")
		})
		return c.json(
			{
				tenantId,
				keyId: key.id,
				apiKey: key.apiKey,
				plan: "free",
				limits: {
					memories: cfg.freeMemoryQuota,
					requestsPerMinute: cfg.freeRateLimitPerMinute,
				},
				note: "Store the API key now — it is shown only once.",
			},
			201,
		)
	})
}

export function keysRouter(db: Db, authMiddleware: ApiKeyAuth) {
	return new Hono()
		.get("/", async (c) => {
			const { tenantId, apiKeyId } = auth(c)
			const rows = await db
				.select({
					id: schema.apiKeys.id,
					label: schema.apiKeys.label,
					createdAt: schema.apiKeys.createdAt,
					revokedAt: schema.apiKeys.revokedAt,
				})
				.from(schema.apiKeys)
				.where(eq(schema.apiKeys.tenantId, tenantId))
				.orderBy(desc(schema.apiKeys.createdAt))
			return c.json({
				keys: rows.map((r) => ({ ...r, current: r.id === apiKeyId })),
			})
		})
		.post("/", validate("json", createKeyInput), async (c) => {
			const { tenantId } = auth(c)
			const { label } = c.req.valid("json")
			const key = await issueKey(db, tenantId, label ?? null)
			return c.json(
				{
					keyId: key.id,
					apiKey: key.apiKey,
					note: "Store the API key now — it is shown only once.",
				},
				201,
			)
		})
		.delete("/:id", validate("param", keyParams), async (c) => {
			const { tenantId } = auth(c)
			const { id } = c.req.valid("param")
			const revoked = await db.transaction(async (tx) => {
				const [active] = await tx
					.select({ n: count() })
					.from(schema.apiKeys)
					.where(
						and(
							eq(schema.apiKeys.tenantId, tenantId),
							isNull(schema.apiKeys.revokedAt),
						),
					)
				const rows = await tx
					.update(schema.apiKeys)
					.set({ revokedAt: new Date() })
					.where(
						and(
							eq(schema.apiKeys.id, id),
							eq(schema.apiKeys.tenantId, tenantId),
							isNull(schema.apiKeys.revokedAt),
						),
					)
					.returning({ id: schema.apiKeys.id })
				if (rows.length === 0)
					throw new HTTPException(404, {
						message: "no active key with that id",
					})
				if (Number(active?.n ?? 0) <= 1) {
					throw new HTTPException(409, {
						message: "cannot revoke the last active key — create another first",
					})
				}
				return rows[0]!
			})
			authMiddleware.evict(revoked.id)
			return c.body(null, 204)
		})
}

export function usageRouter(quota: QuotaGuard) {
	return new Hono().get("/", async (c) => {
		const a = auth(c)
		return c.json({
			tenantId: a.tenantId,
			plan: a.plan ?? "free",
			memories: await quota.memoryCount(a.tenantId),
			limits: {
				memories: a.memoryQuota ?? null,
				requestsPerMinute: a.rateLimitPerMinute ?? null,
			},
		})
	})
}
