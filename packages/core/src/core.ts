import { createClassifier, type Classifier } from "./classify.ts"
import { applyConfidence, reciprocalRankFusion, rankByDecay } from "./fusion.ts"
import type { Embedder } from "./embedder.ts"
import type { Consolidator } from "./consolidator.ts"
import type {
	Memory,
	MemoryEvent,
	MemoryId,
	RecallQuery,
	RecallResult,
	SaveInput,
	SessionId,
} from "./types.ts"

/**
 * Storage contract every backend adapter implements.
 * Phase 1 ships one: Supabase (Postgres + pgvector).
 * A backend swap (SQLite, Turso, DuckDB) never touches the core.
 */
export interface MemoryStore {
	insertMemories(rows: MemoryRow[]): Promise<Memory[]>
	/** Deletes a tenant's memory. Returns the deleted row's sessionId (null if it had none), or undefined if no such row existed for this tenant. */
	deleteMemory(
		tenantId: string,
		id: MemoryId,
	): Promise<{ sessionId: SessionId | null } | undefined>
	/** Dense (vector similarity) channel. */
	search(params: SearchParams): Promise<SearchRow[]>
	/** Keyword (lexical/exact-token) channel — language-neutral tokenization at the store level. */
	searchKeyword(params: KeywordSearchParams): Promise<SearchRow[]>
	/** Closes out the prior memory's validity window and links `newId` as its replacement, in one transaction. */
	reviseMemory(
		tenantId: string,
		oldId: MemoryId,
		newId: MemoryId,
	): Promise<void>
	/** Bumps accessCount/lastAccessedAt for memories returned by a recall — best-effort, feeds future decay ranking. */
	touchAccess(tenantId: string, ids: MemoryId[]): Promise<void>
}

/** Optional entity-graph channel — wired in from @repo/db's graph store when available. Absent in sandbox mode. */
export interface GraphChannel {
	graphChannel(tenantId: string, queryText: string): Promise<string[]>
}

export interface MemoryRow {
	id: MemoryId
	tenantId: string
	userId: string | null
	sessionId: SessionId | null
	text: string
	kind: Memory["kind"]
	source: Memory["source"]
	embedding: Float32Array
	metadata: Record<string, unknown>
}

export interface SearchParams {
	tenantId: string
	userId: string | null
	sessionId: SessionId | null
	queryVec: Float32Array
	topK: number
	includeCrossSession: boolean
	/** Point-in-time filter: only rows valid as of this instant. Defaults to "now" at the store layer. */
	asOf?: Date
}

export interface KeywordSearchParams {
	tenantId: string
	userId: string | null
	sessionId: SessionId | null
	queryText: string
	topK: number
	includeCrossSession: boolean
	asOf?: Date
}

export interface SearchRow {
	memory: Memory
	distance: number
	sessionMatch: boolean
}

export interface MemoryCore {
	save(input: SaveInput): Promise<Memory[]>
	recall(query: RecallQuery): Promise<RecallResult>
	forget(tenantId: string, id: MemoryId): Promise<void>
	/** Events are scoped to (tenantId, sessionId) — a tenant can never observe another tenant's session, even with a colliding sessionId. */
	subscribe(tenantId: string, sessionId: SessionId): AsyncIterable<MemoryEvent>
}

export interface CoreDeps {
	store: MemoryStore
	embedder: Embedder
	consolidator: Consolidator
	/** Optional entity-graph channel for RRF fusion. Sandbox/in-memory mode omits it — dense+keyword still fuse. */
	graph?: GraphChannel
	newId?: () => string
	now?: () => Date
}

// Cosine distance threshold below which a new memory is treated as a
// revision of an existing current one rather than an independent fact.
// Deliberately tight (cosine similarity > 0.92) — this is meant to catch
// near-restatements/light edits of the same slot ("913" replacing "13" in
// an otherwise-identical sentence), not merely-related facts.
const SLOT_MATCH_DISTANCE = 0.08

export function createCore(deps: CoreDeps): MemoryCore {
	const { store, embedder, consolidator, graph } = deps
	const newId = deps.newId ?? (() => cryptoId())
	const now = deps.now ?? (() => new Date())
	const classifier: Classifier = createClassifier(embedder)

	const bus = new SessionBus()

	async function save(input: SaveInput): Promise<Memory[]> {
		const candidates = await consolidator.consolidate(input)
		if (candidates.length === 0) return []
		const vecs = await embedder.embedBatch(candidates.map((c) => c.text))
		// Classify by nearest embedding centroid whenever the consolidator
		// didn't already assign a kind — reuses `vecs`, no extra embedder call.
		const kinds = await Promise.all(
			candidates.map((c, i) => c.kind ?? classifier.classify(vecs[i]!)),
		)
		const rows: MemoryRow[] = candidates.map((c, i) => ({
			id: newId(),
			tenantId: input.tenantId,
			userId: input.userId ?? null,
			sessionId: input.sessionId ?? null,
			text: c.text,
			kind: kinds[i]!,
			source: input.source ?? "text",
			embedding: vecs[i]!,
			metadata: input.metadata ?? {},
		}))
		const memories = await store.insertMemories(rows)

		// Bi-temporal supersession: close out the revised memory's validity
		// window and link it, in one store-level transaction. Only the
		// first inserted row participates — `revises` targets one prior
		// fact, not a batch.
		if (input.revises && memories[0]) {
			await store.reviseMemory(input.tenantId, input.revises, memories[0].id)
			memories[0] = { ...memories[0], supersedesId: input.revises }
		} else if (memories[0] && vecs[0]) {
			// Auto-detect cross-session slot revision: if this new memory is
			// near-duplicate (by embedding) of an existing CURRENT memory for
			// the same user, treat it as a correction rather than a second,
			// contradictory "fact" sitting alongside the old one. This is
			// what makes multi-session recall correct without the caller
			// having to track memory IDs across sessions themselves.
			const near = await store.search({
				tenantId: input.tenantId,
				userId: input.userId ?? null,
				sessionId: input.sessionId ?? null,
				queryVec: vecs[0],
				topK: 2,
				includeCrossSession: true,
			})
			const match = near.find(
				(r) =>
					r.memory.id !== memories[0]?.id && r.distance < SLOT_MATCH_DISTANCE,
			)
			if (match) {
				await store.reviseMemory(
					input.tenantId,
					match.memory.id,
					memories[0].id,
				)
				// Reflect the link in what we return — the inserted snapshot predates it.
				memories[0] = { ...memories[0], supersedesId: match.memory.id }
			}
		}

		const t = now().toISOString()
		for (const m of memories) {
			bus.publish(input.tenantId, m.sessionId, {
				type: "memory.saved",
				memory: { ...m, createdAt: t, updatedAt: t },
			})
		}
		return memories
	}

	async function recall(query: RecallQuery): Promise<RecallResult> {
		const t0 = performance.now()
		const queryVec = await embedder.embed(query.query)
		const t1 = performance.now()

		const topK = query.topK ?? 8
		const asOf = query.asOf ? new Date(query.asOf) : undefined
		const baseParams = {
			tenantId: query.tenantId,
			userId: query.userId ?? null,
			sessionId: query.sessionId ?? null,
			includeCrossSession: query.includeCrossSession ?? true,
			asOf,
		}

		// Four channels, fetched in parallel: dense (vector), keyword
		// (lexical), graph (entity traversal, if wired), temporal (decay
		// over whatever the other three surfaced — no extra query needed).
		const [denseRows, keywordRows, graphIds] = await Promise.all([
			store.search({ ...baseParams, queryVec, topK: topK * 3 }),
			store.searchKeyword({
				...baseParams,
				queryText: query.query,
				topK: topK * 3,
			}),
			graph
				? graph.graphChannel(query.tenantId, query.query)
				: Promise.resolve([]),
		])
		const t2 = performance.now()

		const byId = new Map<string, SearchRow>()
		for (const r of [...denseRows, ...keywordRows]) byId.set(r.memory.id, r)

		const denseRank = denseRows.map((r) => r.memory.id)
		const keywordRank = keywordRows.map((r) => r.memory.id)
		const graphRank = graphIds.filter((id) => byId.has(id))
		const temporalRank = rankByDecay(
			Array.from(byId.values()).map((r) => r.memory),
			now(),
		)

		const fused = reciprocalRankFusion([
			denseRank,
			keywordRank,
			graphRank,
			temporalRank,
		])

		const ranked = Array.from(fused.entries())
			.map(([id, rrfScore]) => {
				const row = byId.get(id)!
				const belief = {
					alpha: row.memory.confidenceAlpha,
					beta: row.memory.confidenceBeta,
				}
				return { row, score: applyConfidence(rrfScore, belief) }
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, topK)

		if (ranked.length > 0) {
			await store.touchAccess(
				query.tenantId,
				ranked.map((r) => r.row.memory.id),
			)
		}

		const hits = ranked.map(({ row, score }) => ({
			memory: row.memory,
			score,
			tier: row.sessionMatch ? ("session" as const) : ("cross" as const),
			channels: {
				dense: denseRank.indexOf(row.memory.id) + 1 || undefined,
				keyword: keywordRank.indexOf(row.memory.id) + 1 || undefined,
				graph: graphRank.indexOf(row.memory.id) + 1 || undefined,
				temporal: temporalRank.indexOf(row.memory.id) + 1 || undefined,
			},
		}))
		const t3 = performance.now()

		return {
			hits,
			latencyMs: {
				total: Math.round(t3 - t0),
				embed: Math.round(t1 - t0),
				search: Math.round(t2 - t1),
				rerank: 0,
			},
		}
	}

	async function forget(tenantId: string, id: MemoryId): Promise<void> {
		const deleted = await store.deleteMemory(tenantId, id)
		if (deleted) {
			bus.publish(tenantId, deleted.sessionId, { type: "memory.forgotten", id })
		}
	}

	function subscribe(
		tenantId: string,
		sessionId: SessionId,
	): AsyncIterable<MemoryEvent> {
		return bus.subscribe(tenantId, sessionId)
	}

	return { save, recall, forget, subscribe }
}

/**
 * In-process pub/sub keyed by (tenant, session). Memories without a
 * session have no subscribers. Single-process only: a multi-instance
 * deployment needs a shared broker (e.g. Postgres LISTEN/NOTIFY or Redis)
 * behind this same interface.
 */
const MAX_QUEUED_EVENTS = 1_000

class SessionBus {
	private listeners = new Map<string, Set<(e: MemoryEvent) => void>>()
	private static key(tenantId: string, sessionId: string): string {
		return `${tenantId}\u0000${sessionId}`
	}
	publish(tenantId: string, sessionId: string | null, event: MemoryEvent) {
		if (sessionId === null) return
		const set = this.listeners.get(SessionBus.key(tenantId, sessionId))
		if (set) for (const l of set) l(event)
	}
	subscribe(tenantId: string, sessionId: string): AsyncIterable<MemoryEvent> {
		const key = SessionBus.key(tenantId, sessionId)
		const queue: MemoryEvent[] = []
		let resolveNext: ((v: IteratorResult<MemoryEvent>) => void) | null = null
		const listener = (e: MemoryEvent) => {
			if (resolveNext) {
				const r = resolveNext
				resolveNext = null
				r({ value: e, done: false })
			} else if (queue.length < MAX_QUEUED_EVENTS) {
				queue.push(e)
			}
		}
		let set = this.listeners.get(key)
		if (!set) {
			set = new Set()
			this.listeners.set(key, set)
		}
		set.add(listener)
		let closed = false
		const close = () => {
			if (closed) return
			closed = true
			set?.delete(listener)
			if (set?.size === 0) this.listeners.delete(key)
			queue.length = 0
			// Wake a consumer parked in next() so its for-await loop exits
			// instead of holding the listener (and its connection) forever.
			if (resolveNext) {
				const r = resolveNext
				resolveNext = null
				r({ value: undefined, done: true })
			}
		}

		return {
			[Symbol.asyncIterator]: () => ({
				next: () => {
					if (queue.length > 0) {
						return Promise.resolve({
							value: queue.shift()!,
							done: false as const,
						})
					}
					if (closed) {
						return Promise.resolve({ value: undefined, done: true as const })
					}
					return new Promise<IteratorResult<MemoryEvent>>((res) => {
						resolveNext = res
					})
				},
				return: () => {
					close()
					return Promise.resolve({ value: undefined, done: true as const })
				},
			}),
		}
	}
}

function cryptoId(): string {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	return `mem_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}
