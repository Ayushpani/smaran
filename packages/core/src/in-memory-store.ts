import { tokenize } from "@repo/language"
import type {
	KeywordSearchParams,
	MemoryRow,
	MemoryStore,
	SearchParams,
	SearchRow,
} from "./core.ts"
import type { Memory } from "./types.ts"

/**
 * In-process MemoryStore for the try-it-now sandbox and unit tests.
 * Cosine similarity + naive tokenized-overlap keyword scoring, both in JS.
 * Not durable — data is lost when the process exits. Use
 * @repo/db/createSupabaseStore for anything beyond a demo.
 */

interface Row {
	id: string
	tenantId: string
	userId: string | null
	sessionId: string | null
	text: string
	kind: Memory["kind"]
	source: Memory["source"]
	embedding: Float32Array
	metadata: Record<string, unknown>
	createdAt: string
	updatedAt: string
	validFrom: string
	validUntil: string | null
	supersedesId: string | null
	confidenceAlpha: number
	confidenceBeta: number
	accessCount: number
	lastAccessedAt: string | null
}

export class InMemoryStore implements MemoryStore {
	private readonly rows = new Map<string, Row>()

	async insertMemories(input: MemoryRow[]): Promise<Memory[]> {
		const now = new Date().toISOString()
		const out: Memory[] = []
		for (const r of input) {
			const row: Row = {
				id: r.id,
				tenantId: r.tenantId,
				userId: r.userId,
				sessionId: r.sessionId,
				text: r.text,
				kind: r.kind,
				source: r.source,
				embedding: r.embedding,
				metadata: r.metadata,
				createdAt: now,
				updatedAt: now,
				validFrom: now,
				validUntil: null,
				supersedesId: null,
				confidenceAlpha: 1,
				confidenceBeta: 1,
				accessCount: 0,
				lastAccessedAt: null,
			}
			this.rows.set(r.id, row)
			out.push(this.toMemory(row))
		}
		return out
	}

	async deleteMemory(
		tenantId: string,
		id: string,
	): Promise<{ sessionId: string | null } | undefined> {
		const row = this.rows.get(id)
		if (!row || row.tenantId !== tenantId) return undefined
		this.rows.delete(id)
		return { sessionId: row.sessionId }
	}

	async reviseMemory(
		tenantId: string,
		oldId: string,
		newId: string,
	): Promise<void> {
		const old = this.rows.get(oldId)
		const next = this.rows.get(newId)
		if (!old || old.tenantId !== tenantId) return
		const now = new Date().toISOString()
		old.validUntil = now
		old.updatedAt = now
		if (next) next.supersedesId = oldId
	}

	async touchAccess(tenantId: string, ids: string[]): Promise<void> {
		const now = new Date().toISOString()
		for (const id of ids) {
			const row = this.rows.get(id)
			if (row && row.tenantId === tenantId) {
				row.accessCount += 1
				row.lastAccessedAt = now
			}
		}
	}

	async search(params: SearchParams): Promise<SearchRow[]> {
		const q = params.queryVec
		const scored: Array<{ row: Row; distance: number }> = []
		for (const row of this.matching(params)) {
			const distance = cosineDistance(q, row.embedding)
			scored.push({ row, distance })
		}
		scored.sort((a, b) => a.distance - b.distance)
		return scored.slice(0, params.topK).map(({ row, distance }) => ({
			memory: this.toMemory(row),
			distance,
			sessionMatch: row.sessionId === params.sessionId,
		}))
	}

	/** Naive tokenized-overlap keyword scoring — sandbox stand-in for Postgres tsvector/GIN. */
	async searchKeyword(params: KeywordSearchParams): Promise<SearchRow[]> {
		const qTokens = new Set(tokenize(params.queryText))
		if (qTokens.size === 0) return []
		const scored: Array<{ row: Row; overlap: number }> = []
		for (const row of this.matching(params)) {
			const docTokens = new Set(tokenize(row.text))
			let overlap = 0
			for (const t of qTokens) if (docTokens.has(t)) overlap++
			if (overlap > 0) scored.push({ row, overlap })
		}
		scored.sort((a, b) => b.overlap - a.overlap)
		return scored.slice(0, params.topK).map(({ row, overlap }) => ({
			memory: this.toMemory(row),
			distance: 1 - overlap / qTokens.size,
			sessionMatch: row.sessionId === params.sessionId,
		}))
	}

	private *matching(params: {
		tenantId: string
		userId: string | null
		sessionId: string | null
		includeCrossSession: boolean
		asOf?: Date
	}): Generator<Row> {
		const asOf = params.asOf?.toISOString()
		for (const row of this.rows.values()) {
			if (row.tenantId !== params.tenantId) continue
			if (params.userId && row.userId !== params.userId) continue
			if (!params.includeCrossSession && row.sessionId !== params.sessionId) {
				continue
			}
			if (asOf) {
				if (row.validFrom > asOf) continue
				if (row.validUntil && row.validUntil <= asOf) continue
			} else if (row.validUntil) {
				continue // default recall = current facts only
			}
			yield row
		}
	}

	size(): number {
		return this.rows.size
	}

	clear(): void {
		this.rows.clear()
	}

	private toMemory(row: Row): Memory {
		return {
			id: row.id,
			tenantId: row.tenantId,
			userId: row.userId,
			sessionId: row.sessionId,
			text: row.text,
			kind: row.kind,
			source: row.source,
			metadata: row.metadata,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			validFrom: row.validFrom,
			validUntil: row.validUntil,
			supersedesId: row.supersedesId,
			confidenceAlpha: row.confidenceAlpha,
			confidenceBeta: row.confidenceBeta,
			accessCount: row.accessCount,
			lastAccessedAt: row.lastAccessedAt,
		}
	}
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
	const len = Math.min(a.length, b.length)
	let dot = 0
	let na = 0
	let nb = 0
	for (let i = 0; i < len; i++) {
		const av = a[i]!
		const bv = b[i]!
		dot += av * bv
		na += av * av
		nb += bv * bv
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb)
	if (denom === 0) return 1
	return 1 - dot / denom
}
