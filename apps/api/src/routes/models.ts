import { validate } from "../http.ts"
import { schema, type Db } from "@repo/db"
import { and, desc, eq, isNull, or } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../auth.ts"
import type { ModelResolver } from "../model-resolver.ts"

/**
 * Per-tenant model registry. A tenant can register multiple embedder or
 * reranker candidates and activate exactly one of each. Recall paths
 * look up the active row for the caller's tenant and fall back to the
 * platform default (tenant_id NULL) when nothing is bound.
 *
 * Ships the API surface now — the actual recall-path swap arrives in
 * the next commit so this stays a small, verifiable change.
 */

export const registerInput = z.object({
	role: z.enum(["embedder", "reranker"]),
	name: z.string().min(1).max(200),
	provider: z.string().min(1).max(60),
	config: z.record(z.unknown()).optional(),
})

export const activateInput = z.object({
	id: z.string().min(1),
})

export const listQuery = z.object({
	role: z.enum(["embedder", "reranker"]).optional(),
	includeDefaults: z.coerce.boolean().default(true),
})

function newId(prefix: string): string {
	const bytes = new Uint8Array(8)
	crypto.getRandomValues(bytes)
	return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}

export function modelsRouter(db: Db, resolver?: ModelResolver) {
	return new Hono()
		.post("/", validate("json", registerInput), async (c) => {
			const { tenantId } = auth(c)
			const body = c.req.valid("json")
			const [row] = await db
				.insert(schema.modelRegistry)
				.values({
					id: newId("mdl"),
					tenantId,
					role: body.role,
					name: body.name,
					provider: body.provider,
					config: body.config ?? {},
				})
				.returning()
			return c.json({ model: row })
		})
		.get("/", validate("query", listQuery), async (c) => {
			const { tenantId } = auth(c)
			const { role, includeDefaults } = c.req.valid("query")
			const tenantMatch = includeDefaults
				? or(
						eq(schema.modelRegistry.tenantId, tenantId),
						isNull(schema.modelRegistry.tenantId),
					)
				: eq(schema.modelRegistry.tenantId, tenantId)
			const filters = [tenantMatch]
			if (role) filters.push(eq(schema.modelRegistry.role, role))
			const rows = await db
				.select()
				.from(schema.modelRegistry)
				.where(and(...filters))
				.orderBy(desc(schema.modelRegistry.createdAt))
			return c.json({ models: rows })
		})
		.post("/:id/activate", validate("param", activateInput), async (c) => {
			const { tenantId } = auth(c)
			const { id } = c.req.valid("param")
			const [target] = await db
				.select()
				.from(schema.modelRegistry)
				.where(
					and(
						eq(schema.modelRegistry.id, id),
						eq(schema.modelRegistry.tenantId, tenantId),
					),
				)
				.limit(1)
			if (!target) return c.json({ error: "not found" }, 404)

			await db
				.update(schema.modelRegistry)
				.set({ activatedAt: null })
				.where(
					and(
						eq(schema.modelRegistry.tenantId, tenantId),
						eq(schema.modelRegistry.role, target.role),
					),
				)
			const [row] = await db
				.update(schema.modelRegistry)
				.set({ activatedAt: new Date() })
				.where(eq(schema.modelRegistry.id, id))
				.returning()
			resolver?.invalidate(tenantId)
			return c.json({ model: row })
		})
}
