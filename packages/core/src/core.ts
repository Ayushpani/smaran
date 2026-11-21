import { createClassifier, type Classifier } from "./classify.ts"
import {
	applyConfidence,
	decayScore,
	rankByDecay,
	reciprocalRankFusion,
} from "./fusion.ts"
import type { Embedder } from "./embedder.ts"
import type { Consolidator } from "./consolidator.ts"
import { classifyRevision, type RevisionKind } from "./revision.ts"
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
	/**
	 * Links `newId` as the successor of `oldId` (sets newId.supersedesId).
	 * With `closeOld` (the default) it also closes the old memory's validity
	 * window, so default recall stops returning it — in one transaction.
	 */
	reviseMemory(
		tenantId: string,
		oldId: MemoryId,
		newId: MemoryId,
		opts?: { closeOld?: boolean },
	): Promise<void>
	/** Adds evidence to a memory's Beta(alpha, beta) belief: corroboration raises alpha, contradiction raises beta. */
	adjustBelief(
		tenantId: string,
		id: MemoryId,
		delta: { alpha?: number; beta?: number },
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

// How many nearest existing memories (per channel) to check when deciding
// whether a new statement duplicates, replaces or relates to one of them.
const REVISION_CANDIDATES = 5
// Max relative boost recency can give a hit (tie-breaker, not a ranking signal).
const RECENCY_WEIGHT = 0.05
const REVISION_RANK: Record<RevisionKind, number> = {
	none: 0,
	related: 1,
	replace: 2,
	duplicate: 3,
}

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
		const userId = input.userId ?? null

		// Relate each candidate to the user's existing CURRENT memories.
		// Candidates come from both the dense and keyword channels so this
		// works under any embedder; the decision itself is lexical (see
		// revision.ts — similarity alone can't separate "updated value"
		// from "different fact").
		const relations = await Promise.all(
			candidates.map(async (c, i) => {
				if (input.revises) return null
				const scope = {
					tenantId: input.tenantId,
					userId,
					sessionId: input.sessionId ?? null,
					topK: REVISION_CANDIDATES,
					includeCrossSession: true,
				}
				const [dense, keyword] = await Promise.all([
					store.search({ ...scope, queryVec: vecs[i]! }),
					store.searchKeyword({ ...scope, queryText: c.text }),
				])
				let best: { memory: Memory; kind: RevisionKind } | null = null
				for (const r of [...dense, ...keyword]) {
					// Revision only ever applies within the exact same user —
					// a null userId must not match other users' memories.
					if (r.memory.userId !== userId) continue
					const kind = classifyRevision(r.memory.text, c.text)
					if (kind === "none") continue
					if (!best || REVISION_RANK[kind] > REVISION_RANK[best.kind]) {
						best = { memory: r.memory, kind }
					}
				}
				return best
			}),
		)

		const toInsert: number[] = []
		const result: Array<Memory | undefined> = new Array(candidates.length)
		for (let i = 0; i < candidates.length; i++) {
			const rel = relations[i]
			if (rel?.kind === "duplicate") {
				// Restating a known fact is evidence for it, not a new row.
				await store.adjustBelief(input.tenantId, rel.memory.id, { alpha: 1 })
				result[i] = {
					...rel.memory,
					confidenceAlpha: rel.memory.confidenceAlpha + 1,
				}
			} else {
				toInsert.push(i)
			}
		}

		const rows: MemoryRow[] = toInsert.map((i) => ({
			id: newId(),
			tenantId: input.tenantId,
			userId,
			sessionId: input.sessionId ?? null,
			text: candidates[i]!.text,
			kind: kinds[i]!,
			source: input.source ?? "text",
			embedding: vecs[i]!,
			metadata: input.metadata ?? {},
		}))
		const inserted = rows.length > 0 ? await store.insertMemories(rows) : []

		for (let j = 0; j < inserted.length; j++) {
			const i = toInsert[j]!
			let memory = inserted[j]!
			if (input.revises && j === 0) {
				// Explicit caller-supplied revision: always a hard replace.
				await store.reviseMemory(input.tenantId, input.revises, memory.id)
				memory = { ...memory, supersedesId: input.revises }
			} else {
				const rel = relations[i]
				if (rel?.kind === "replace") {
					await store.reviseMemory(input.tenantId, rel.memory.id, memory.id)
					memory = { ...memory, supersedesId: rel.memory.id }
				} else if (rel?.kind === "related") {
					await store.reviseMemory(input.tenantId, rel.memory.id, memory.id, {
						closeOld: false,
					})
					await store.adjustBelief(input.tenantId, rel.memory.id, { beta: 1 })
					memory = { ...memory, supersedesId: rel.memory.id }
				}
			}
			result[i] = memory
		}
		const memories = result.filter((m): m is Memory => m !== undefined)

		const t = now().toISOString()
		for (const m of inserted) {
			bus.publish(input.tenantId, m.sessionId, {
				type: "memory.saved",
				memory: { ...m, createdAt: t, updatedAt: t },
			})
		}
		return memories
	}

	async function recall(query: RecallQuery): Promise<RecallResult> {
		const t0 = performance.now()
		// Asymmetric models (e.g. e5) embed queries differently from passages.
		const queryVec = await (embedder.embedQuery
			? embedder.embedQuery(query.query)
			: embedder.embed(query.query))
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

		// Three retrieval channels in parallel: dense (vector), keyword
		// (lexical, IDF-weighted), graph (entity traversal, if wired).
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

		// Relevance channels only. Recency is deliberately NOT an equal
		// RRF vote: measured on LoCoMo it halved hit@1 (recently-touched
		// memories outranked ones that answer the query). It survives as a
		// small multiplicative tie-breaker below.
		const fused = reciprocalRankFusion([denseRank, keywordRank, graphRank])
		const t = now()
		const ranked = Array.from(fused.entries())
			.map(([id, rrfScore]) => {
				const row = byId.get(id)!
				const m = row.memory
				const belief = { alpha: m.confidenceAlpha, beta: m.confidenceBeta }
				const recency = decayScore(
					m.lastAccessedAt ?? m.createdAt,
					m.accessCount,
					t,
				)
				const score =
					applyConfidence(rrfScore, belief) *
					(1 + RECENCY_WEIGHT * Math.min(recency, 1))
				return { row, score }
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, topK)

		if (ranked.length > 0) {
			// Best-effort usage stats — never make the caller wait on a write.
			void store
				.touchAccess(
					query.tenantId,
					ranked.map((r) => r.row.memory.id),
				)
				.catch(() => {})
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
