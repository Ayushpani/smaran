import { validate } from "../http.ts"
import type { MemoryCore } from "@repo/core"
import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../auth.ts"
import { shouldRerank } from "@repo/models"
import type { ModelResolver } from "../model-resolver.ts"

export const recallInput = z.object({
	query: z.string().min(1).max(4_000),
	userId: z.string().max(200).optional(),
	sessionId: z.string().max(200).optional(),
	topK: z.number().int().min(1).max(50).default(8),
	includeCrossSession: z.boolean().default(true),
	/** Re-order with the reranker when one is configured (default on). */
	rerank: z.boolean().default(true),
	/**
	 * Candidates the reranker re-orders (server default RERANK_POOL=40).
	 * Larger = better recall, slower: on LoCoMo 20→60 raises hit@10
	 * 75.3%→80.1% at ~94→191 ms per query.
	 */
	rerankPool: z.number().int().min(1).max(100).optional(),
	/** Point-in-time recall: ISO timestamp, defaults to now (current facts only). */
	asOf: z.string().datetime().optional(),
})

export function recallRouter(
	core: MemoryCore,
	resolver: ModelResolver,
	rerankPool = 20,
) {
	return new Hono().post("/", validate("json", recallInput), async (c) => {
		const { tenantId } = auth(c)
		const body = c.req.valid("json")
		const resolved = body.rerank ? await resolver.resolve(tenantId) : null
		const reranker = resolved?.reranker ?? null

		// Retrieve a wider pool for the reranker to choose from, then trim.
		const poolSize = reranker
			? Math.max(body.topK, body.rerankPool ?? rerankPool)
			: body.topK
		const { rerankPool: _pool, ...query } = body
		const result = await core.recall({ tenantId, ...query, topK: poolSize })
		const texts = result.hits.map((h) => h.memory.text)

		// The built-in cross-encoder is English-only: only use it where it
		// was measured to help. Tenant-configured rerankers always apply.
		const apply =
			reranker !== null &&
			result.hits.length > 1 &&
			(resolved?.source !== "builtin" || shouldRerank(body.query, texts))
		if (!apply) {
			return c.json({ ...result, hits: result.hits.slice(0, body.topK) })
		}

		const rerankResult = await reranker.rerank(
			body.query,
			result.hits.map((h) => ({
				id: h.memory.id,
				text: h.memory.text,
				score: h.score,
			})),
			body.topK,
		)
		const byId = new Map(result.hits.map((h) => [h.memory.id, h]))
		const hits = rerankResult.candidates.flatMap((r) => {
			const h = byId.get(r.id)
			return h ? [{ ...h, score: r.score }] : []
		})

		return c.json({
			hits,
			latencyMs: {
				...result.latencyMs,
				rerank: rerankResult.rerankMs,
				total: result.latencyMs.total + rerankResult.rerankMs,
			},
			reranker: rerankResult.model,
			rerankerSource: resolved?.source,
		})
	})
}
