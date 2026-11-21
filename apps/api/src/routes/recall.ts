import { validate } from "../http.ts"
import type { MemoryCore } from "@repo/core"
import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../auth.ts"
import type { ModelResolver } from "../model-resolver.ts"

const recallInput = z.object({
	query: z.string().min(1).max(4_000),
	userId: z.string().max(200).optional(),
	sessionId: z.string().max(200).optional(),
	topK: z.number().int().min(1).max(50).default(8),
	includeCrossSession: z.boolean().default(true),
	rerank: z.boolean().default(false),
	/** Point-in-time recall: ISO timestamp, defaults to now (current facts only). */
	asOf: z.string().datetime().optional(),
})

export function recallRouter(core: MemoryCore, resolver: ModelResolver) {
	return new Hono().post("/", validate("json", recallInput), async (c) => {
		const { tenantId } = auth(c)
		const body = c.req.valid("json")
		const result = await core.recall({ tenantId, ...body })
		if (!body.rerank || result.hits.length === 0) return c.json(result)

		const resolved = await resolver.resolve(tenantId)
		const candidates = result.hits.map((h) => ({
			id: h.memory.id,
			text: h.memory.text,
			score: h.score,
		}))
		const rerankResult = await resolved.reranker.rerank(
			body.query,
			candidates,
			body.topK,
		)
		const scoreById = new Map(
			rerankResult.candidates.map((r) => [r.id, r.score]),
		)
		const rerankedHits = result.hits
			.filter((h) => scoreById.has(h.memory.id))
			.map((h) => ({ ...h, score: scoreById.get(h.memory.id) ?? h.score }))
			.sort((a, b) => b.score - a.score)

		return c.json({
			hits: rerankedHits,
			latencyMs: {
				...result.latencyMs,
				rerank: rerankResult.rerankMs,
				total: result.latencyMs.total + rerankResult.rerankMs,
			},
			reranker: rerankResult.model,
			rerankerSource: resolved.source,
		})
	})
}
