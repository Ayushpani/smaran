import { validate } from "../http.ts"
import { createGraphStore, type Db } from "@repo/db"
import { extractEntities } from "@repo/language"
import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../auth.ts"

/**
 * Entity + relation graph endpoints. Backing store: @repo/db/graph.ts.
 * Phase 5 exposes:
 *   POST /entities        — upsert entities (idempotent by name+kind).
 *   POST /entities/extract — one-shot: run the extractor on text and
 *                            persist what it finds.
 *   POST /relations       — bulk insert relations.
 *   POST /traverse        — recursive-CTE multi-hop walk from a start
 *                            entity, returns visited entities + touched
 *                            memories (hydrated).
 */

export const upsertInput = z.object({
	entities: z
		.array(
			z.object({
				name: z.string().min(1).max(300),
				kind: z.string().min(1).max(40),
				metadata: z.record(z.unknown()).optional(),
			}),
		)
		.min(1)
		.max(500),
})

export const extractInput = z.object({
	text: z.string().min(1).max(50_000),
})

export const relationsInput = z.object({
	relations: z
		.array(
			z.object({
				fromEntityId: z.string().min(1),
				toEntityId: z.string().min(1),
				predicate: z.string().min(1).max(80),
				memoryId: z.string().min(1).optional(),
			}),
		)
		.min(1)
		.max(500),
})

export const traverseInput = z.object({
	startEntityId: z.string().min(1),
	maxHops: z.number().int().min(1).max(4).default(2),
	memoryLimit: z.number().int().min(1).max(200).default(20),
})

export function graphRouter(db: Db) {
	const graph = createGraphStore(db)

	return new Hono()
		.post("/entities", validate("json", upsertInput), async (c) => {
			const { tenantId } = auth(c)
			const { entities } = c.req.valid("json")
			const rows = await graph.upsertEntities(tenantId, entities)
			return c.json({ entities: rows })
		})
		.post("/entities/extract", validate("json", extractInput), async (c) => {
			const { tenantId } = auth(c)
			const { text } = c.req.valid("json")
			const extracted = extractEntities(text)
			if (extracted.length === 0) return c.json({ entities: [] })
			const rows = await graph.upsertEntities(
				tenantId,
				extracted.map((e) => ({ name: e.name, kind: e.kind })),
			)
			return c.json({ entities: rows, spans: extracted })
		})
		.post("/relations", validate("json", relationsInput), async (c) => {
			const { tenantId } = auth(c)
			const { relations } = c.req.valid("json")
			const rows = await graph.addRelations(tenantId, relations)
			return c.json({ relations: rows })
		})
		.post("/traverse", validate("json", traverseInput), async (c) => {
			const { tenantId } = auth(c)
			const { startEntityId, maxHops, memoryLimit } = c.req.valid("json")
			const walk = await graph.traverse(
				tenantId,
				startEntityId,
				maxHops,
				memoryLimit,
			)
			const rows = await graph.fetchMemoriesByIds(tenantId, walk.memoryIds)
			const memories = rows.map((r) => ({
				id: r.id,
				text: r.text,
				kind: r.kind,
				sessionId: r.sessionId,
				userId: r.userId,
				createdAt: r.createdAt.toISOString(),
			}))
			return c.json({
				hops: walk.hops,
				entities: walk.entityIds,
				memories,
			})
		})
}
