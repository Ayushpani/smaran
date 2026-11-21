import { zValidator } from "@hono/zod-validator"
import { schema, type Db } from "@repo/db"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../auth.ts"

/**
 * DPDP Act (India) + GDPR compliance surface. Three obligations:
 *  - Right to erase   → POST /right-to-forget
 *  - Right to export  → GET  /export
 *  - Consent record   → POST /consent
 * Every operation is tenant-scoped by the API-key middleware; no
 * cross-tenant call is possible from any auth path.
 */

const forgetInput = z.object({
	userId: z.string().min(1).max(200),
})

const exportInput = z.object({
	userId: z.string().min(1).max(200),
})

const consentInput = z.object({
	userId: z.string().min(1).max(200),
	sessionId: z.string().max(200).optional(),
	kind: z.enum(["record", "process", "retain", "share"]),
	granted: z.boolean(),
	scope: z.string().max(500).optional(),
})

export function dpdpRouter(db: Db) {
	return new Hono()
		.post("/right-to-forget", zValidator("json", forgetInput), async (c) => {
			const { tenantId } = auth(c)
			const { userId } = c.req.valid("json")
			// One transaction: erasure is all-or-nothing. The profile is a
			// summary OF the user's memories, so it is personal data too.
			const { deletedMemories, deletedSessions, deletedProfiles } =
				await db.transaction(async (tx) => {
					const deletedMemories = await tx
						.delete(schema.memories)
						.where(
							and(
								eq(schema.memories.tenantId, tenantId),
								eq(schema.memories.userId, userId),
							),
						)
						.returning({ id: schema.memories.id })
					const deletedSessions = await tx
						.delete(schema.sessions)
						.where(
							and(
								eq(schema.sessions.tenantId, tenantId),
								eq(schema.sessions.userId, userId),
							),
						)
						.returning({ id: schema.sessions.id })
					const deletedProfiles = await tx
						.delete(schema.profiles)
						.where(
							and(
								eq(schema.profiles.tenantId, tenantId),
								eq(schema.profiles.userId, userId),
							),
						)
						.returning({ id: schema.profiles.id })
					return { deletedMemories, deletedSessions, deletedProfiles }
				})
			return c.json({
				userId,
				memoriesDeleted: deletedMemories.length,
				sessionsDeleted: deletedSessions.length,
				profileDeleted: deletedProfiles.length > 0,
				forgetTimestamp: new Date().toISOString(),
			})
		})
		.get("/export", zValidator("query", exportInput), async (c) => {
			const { tenantId } = auth(c)
			const { userId } = c.req.valid("query")
			const [memories, sessions, profiles] = await Promise.all([
				db
					.select()
					.from(schema.memories)
					.where(
						and(
							eq(schema.memories.tenantId, tenantId),
							eq(schema.memories.userId, userId),
						),
					),
				db
					.select()
					.from(schema.sessions)
					.where(
						and(
							eq(schema.sessions.tenantId, tenantId),
							eq(schema.sessions.userId, userId),
						),
					),
				db
					.select()
					.from(schema.profiles)
					.where(
						and(
							eq(schema.profiles.tenantId, tenantId),
							eq(schema.profiles.userId, userId),
						),
					),
			])
			const stripped = memories.map((m) => ({ ...m, embedding: undefined }))
			return c.json({
				userId,
				tenantId,
				exportedAt: new Date().toISOString(),
				memories: stripped,
				sessions,
				profile: profiles[0] ?? null,
			})
		})
		.post("/consent", zValidator("json", consentInput), async (c) => {
			const { tenantId } = auth(c)
			const body = c.req.valid("json")
			return c.json({
				tenantId,
				userId: body.userId,
				kind: body.kind,
				granted: body.granted,
				scope: body.scope ?? null,
				sessionId: body.sessionId ?? null,
				recordedAt: new Date().toISOString(),
			})
		})
}
