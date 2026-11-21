import type {
	KeywordSearchParams,
	Memory,
	MemoryRow,
	MemoryStore,
	SearchParams,
	SearchRow,
} from "@repo/core"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { Db } from "./client.ts"
import { memories } from "./schema.ts"

type MemoriesRow = typeof memories.$inferSelect

/** Caps distinct query lexemes considered, bounding cost for very long queries. */
const MAX_QUERY_TOKENS = 32

function toMemory(m: MemoriesRow): Memory {
	return {
		id: m.id,
		tenantId: m.tenantId,
		userId: m.userId,
		sessionId: m.sessionId,
		text: m.text,
		kind: m.kind,
		source: m.source,
		createdAt: m.createdAt.toISOString(),
		updatedAt: m.updatedAt.toISOString(),
		metadata: (m.metadata as Record<string, unknown>) ?? {},
		validFrom: m.validFrom.toISOString(),
		validUntil: m.validUntil ? m.validUntil.toISOString() : null,
		supersedesId: m.supersedesId,
		confidenceAlpha: m.confidenceAlpha,
		confidenceBeta: m.confidenceBeta,
		accessCount: m.accessCount,
		lastAccessedAt: m.lastAccessedAt ? m.lastAccessedAt.toISOString() : null,
	}
}

/** Point-in-time validity filter shared by both search channels. `asOf` unset = current facts only. */
function validityFilter(asOf: Date | undefined) {
	if (asOf) {
		return sql`${memories.validFrom} <= ${asOf} AND (${memories.validUntil} IS NULL OR ${memories.validUntil} > ${asOf})`
	}
	return sql`${memories.validUntil} IS NULL`
}

export function createSupabaseStore(db: Db): MemoryStore {
	return {
		async insertMemories(rows: MemoryRow[]): Promise<Memory[]> {
			if (rows.length === 0) return []
			const values = rows.map((r) => ({
				id: r.id,
				tenantId: r.tenantId,
				userId: r.userId,
				sessionId: r.sessionId,
				text: r.text,
				kind: r.kind,
				source: r.source,
				embedding: Array.from(r.embedding),
				metadata: r.metadata,
			}))
			const inserted = await db.insert(memories).values(values).returning()
			return inserted.map(toMemory)
		},

		async deleteMemory(tenantId, id) {
			const [row] = await db
				.delete(memories)
				.where(and(eq(memories.tenantId, tenantId), eq(memories.id, id)))
				.returning({ sessionId: memories.sessionId })
			return row ? { sessionId: row.sessionId } : undefined
		},

		async reviseMemory(tenantId, oldId, newId, opts = {}) {
			await db.transaction(async (tx) => {
				// Only link to a prior memory that belongs to this tenant.
				const [prior] = await tx
					.select({ id: memories.id })
					.from(memories)
					.where(and(eq(memories.tenantId, tenantId), eq(memories.id, oldId)))
					.limit(1)
				if (!prior) return
				if (opts.closeOld ?? true) {
					await tx
						.update(memories)
						.set({ validUntil: sql`now()`, updatedAt: sql`now()` })
						.where(and(eq(memories.tenantId, tenantId), eq(memories.id, oldId)))
				}
				await tx
					.update(memories)
					.set({ supersedesId: oldId })
					.where(and(eq(memories.tenantId, tenantId), eq(memories.id, newId)))
			})
		},

		async adjustBelief(tenantId, id, delta) {
			await db
				.update(memories)
				.set({
					confidenceAlpha: sql`${memories.confidenceAlpha} + ${delta.alpha ?? 0}`,
					confidenceBeta: sql`${memories.confidenceBeta} + ${delta.beta ?? 0}`,
					updatedAt: sql`now()`,
				})
				.where(and(eq(memories.tenantId, tenantId), eq(memories.id, id)))
		},

		async touchAccess(tenantId, ids) {
			if (ids.length === 0) return
			await db
				.update(memories)
				.set({
					accessCount: sql`${memories.accessCount} + 1`,
					lastAccessedAt: sql`now()`,
				})
				.where(and(eq(memories.tenantId, tenantId), inArray(memories.id, ids)))
		},

		async search(params: SearchParams): Promise<SearchRow[]> {
			const vec = `[${Array.from(params.queryVec).join(",")}]`
			const scopeFilter = params.includeCrossSession
				? sql`TRUE`
				: sql`${memories.sessionId} = ${params.sessionId}`
			const userFilter = params.userId
				? sql`${memories.userId} = ${params.userId}`
				: sql`TRUE`

			const rows = await db
				.select({
					m: memories,
					distance: sql<number>`${memories.embedding} <=> ${vec}::vector`.as(
						"distance",
					),
				})
				.from(memories)
				.where(
					and(
						eq(memories.tenantId, params.tenantId),
						scopeFilter,
						userFilter,
						validityFilter(params.asOf),
					),
				)
				// Exact search within the caller's scope, deliberately NOT via the
				// HNSW index: pgvector's HNSW scan returns only the ~ef_search
				// nearest rows in the WHOLE table and filters tenant/user after,
				// so in a multi-tenant table a user's memories silently drop out.
				// "+ 0" makes the expression non-indexable; the planner then uses
				// the (tenant_id, user_id) index and sorts that user's rows.
				.orderBy(sql`(${memories.embedding} <=> ${vec}::vector) + 0`)
				.limit(params.topK)

			return rows.map((r) => ({
				memory: toMemory(r.m),
				distance: Number(r.distance),
				sessionMatch: r.m.sessionId === params.sessionId,
			}))
		},

		/**
		 * Keyword channel, IDF-weighted — the same scoring as the in-memory
		 * store: score(d) = Σ idf(t) over distinct query tokens t present in
		 * d, idf = ln(1 + (N − df + 0.5) / (df + 0.5)) computed over the
		 * caller's scoped memories. Tokens are OR-ed: the previous
		 * plainto_tsquery() AND-ed every word of the question, so a natural
		 * question ("when did Caroline go to the support group") matched
		 * almost nothing. Uses the GIN-indexed `text_tsv` ('simple' config:
		 * no language-specific stemming or stopwords).
		 */
		async searchKeyword(params: KeywordSearchParams): Promise<SearchRow[]> {
			const scopeFilter = params.includeCrossSession
				? sql`TRUE`
				: sql`m.session_id = ${params.sessionId}`
			const userFilter = params.userId
				? sql`m.user_id = ${params.userId}`
				: sql`TRUE`
			const validity = params.asOf
				? sql`m.valid_from <= ${params.asOf} AND (m.valid_until IS NULL OR m.valid_until > ${params.asOf})`
				: sql`m.valid_until IS NULL`
			// One pass: expand each scoped memory's lexemes, keep the ones in
			// the query, then df and the IDF sum fall out of two GROUP BYs.
			// (Per-token @@ checks cost ~3 tsquery matches per token per row —
			// ~100 ms on a few hundred memories for a 30-word query.) The
			// query is tokenized by the same 'simple' parser as text_tsv, so
			// query and memory lexemes always line up.
			const scored = (await db.execute(sql`
				WITH s AS (
					SELECT m.id, m.text_tsv FROM memories m
					WHERE m.tenant_id = ${params.tenantId}
						AND ${scopeFilter} AND ${userFilter} AND ${validity}
				),
				n AS (SELECT count(*)::float AS n FROM s),
				ql AS (
					SELECT DISTINCT lexeme FROM unnest(to_tsvector('simple', ${params.queryText}))
					LIMIT ${MAX_QUERY_TOKENS}
				),
				dl AS (
					SELECT s.id, u.lexeme
					FROM s CROSS JOIN LATERAL unnest(s.text_tsv) u
					JOIN ql ON ql.lexeme = u.lexeme
				),
				df AS (SELECT lexeme, count(*)::float AS df FROM dl GROUP BY lexeme)
				SELECT dl.id, sum(ln(1 + (n.n - df.df + 0.5) / (df.df + 0.5)))::float AS score
				FROM dl JOIN df USING (lexeme) CROSS JOIN n
				GROUP BY dl.id
				ORDER BY score DESC
				LIMIT ${params.topK}
			`)) as unknown as Array<{ id: string; score: number }>
			if (scored.length === 0) return []

			const rows = await db
				.select()
				.from(memories)
				.where(
					and(
						eq(memories.tenantId, params.tenantId),
						inArray(
							memories.id,
							scored.map((r) => r.id),
						),
					),
				)
			const byId = new Map(rows.map((r) => [r.id, r]))
			return scored
				.filter((r) => byId.has(r.id))
				.map((r) => {
					const m = byId.get(r.id)!
					return {
						memory: toMemory(m),
						distance: 1 / (1 + Number(r.score)),
						sessionMatch: m.sessionId === params.sessionId,
					}
				})
		},
	}
}
