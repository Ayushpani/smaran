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

		async reviseMemory(tenantId, oldId, newId) {
			await db.transaction(async (tx) => {
				await tx
					.update(memories)
					.set({ validUntil: sql`now()`, updatedAt: sql`now()` })
					.where(and(eq(memories.tenantId, tenantId), eq(memories.id, oldId)))
				await tx
					.update(memories)
					.set({ supersedesId: oldId })
					.where(and(eq(memories.tenantId, tenantId), eq(memories.id, newId)))
			})
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
				.orderBy(sql`distance ASC`)
				.limit(params.topK)

			return rows.map((r) => ({
				memory: toMemory(r.m),
				distance: Number(r.distance),
				sessionMatch: r.m.sessionId === params.sessionId,
			}))
		},

		/**
		 * Keyword channel: Postgres full-text search against the generated
		 * `text_tsv` column (GIN-indexed, `'simple'` config — lowercasing
		 * and tokenizing only, no English stemming/stopwords, so this stays
		 * language-neutral by construction). `ts_rank` gives the ranking
		 * signal; RRF fusion in core.ts only needs the resulting order.
		 */
		async searchKeyword(params: KeywordSearchParams): Promise<SearchRow[]> {
			const scopeFilter = params.includeCrossSession
				? sql`TRUE`
				: sql`${memories.sessionId} = ${params.sessionId}`
			const userFilter = params.userId
				? sql`${memories.userId} = ${params.userId}`
				: sql`TRUE`
			const tsq = sql`plainto_tsquery('simple', ${params.queryText})`

			const rows = await db
				.select({
					m: memories,
					rank: sql<number>`ts_rank(${memories.textTsv}, ${tsq})`.as("rank"),
				})
				.from(memories)
				.where(
					and(
						eq(memories.tenantId, params.tenantId),
						scopeFilter,
						userFilter,
						validityFilter(params.asOf),
						sql`${memories.textTsv} @@ ${tsq}`,
					),
				)
				.orderBy(sql`rank DESC`)
				.limit(params.topK)

			return rows.map((r) => ({
				memory: toMemory(r.m),
				distance: 1 - Number(r.rank),
				sessionMatch: r.m.sessionId === params.sessionId,
			}))
		},
	}
}
