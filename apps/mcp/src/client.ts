/**
 * First-party client for Smaran's real API (apps/api): POST /v1/recall,
 * POST /v1/memories, DELETE /v1/memories/:id. No third-party SDK, no
 * assumed accounts/projects layer — just the self-hosted API surface that
 * actually exists.
 */

const MAX_CHARS = 200000 // ~50k tokens (character-based limit)
export const DEFAULT_USER_ID = "default"

export interface MemoryHit {
	id: string
	text: string
	score: number
	tier: string
}

export interface RecallResult {
	hits: MemoryHit[]
	latencyMs: number
}

export interface SaveResult {
	id: string | null
	saved: boolean
}

function limitByChars(text: string, maxChars = MAX_CHARS): string {
	return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text
}

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message)
		this.name = "ApiError"
	}
}

export class SmaranClient {
	constructor(
		private apiKey: string,
		private apiUrl: string,
	) {}

	private headers(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
		}
	}

	private async request<T>(path: string, init: RequestInit): Promise<T> {
		let response: Response
		try {
			response = await fetch(`${this.apiUrl}${path}`, {
				...init,
				headers: {
					...this.headers(),
					...(init.headers as Record<string, string>),
				},
			})
		} catch {
			throw new Error(
				"Network error. Please check your connection and try again.",
			)
		}

		if (!response.ok) {
			const text = await response.text().catch(() => "")
			if (response.status === 401) {
				throw new ApiError(
					"Authentication failed. Check your Smaran API key.",
					401,
				)
			}
			if (response.status === 429) {
				throw new ApiError(
					"Rate limit exceeded. Please wait a moment and try again.",
					429,
				)
			}
			if (response.status >= 500) {
				throw new ApiError(
					"Server error. The service may be temporarily unavailable.",
					response.status,
				)
			}
			throw new ApiError(
				text || `Request failed with status ${response.status}`,
				response.status,
			)
		}

		if (response.status === 204) {
			return undefined as T
		}
		return (await response.json()) as T
	}

	async recall(
		query: string,
		userId: string,
		sessionId?: string,
		topK = 5,
	): Promise<RecallResult> {
		const start = Date.now()
		const body: Record<string, unknown> = {
			query,
			userId,
			topK,
			includeCrossSession: true,
		}
		if (sessionId) body.sessionId = sessionId

		const data = await this.request<{
			hits: {
				memory: { id: string; text: string }
				score: number
				tier: string
			}[]
		}>("/v1/recall", { method: "POST", body: JSON.stringify(body) })

		const hits: MemoryHit[] = data.hits
			.filter((h) => h.memory?.text)
			.map((h) => ({
				id: h.memory.id,
				text: limitByChars(h.memory.text),
				score: h.score,
				tier: h.tier,
			}))

		return { hits, latencyMs: Date.now() - start }
	}

	async save(
		text: string,
		userId: string,
		sessionId?: string,
	): Promise<SaveResult> {
		const body: Record<string, unknown> = { text, userId }
		if (sessionId) body.sessionId = sessionId

		const data = await this.request<{ memories: { id: string }[] }>(
			"/v1/memories",
			{
				method: "POST",
				body: JSON.stringify(body),
			},
		)

		const saved = data.memories && data.memories.length > 0
		return { id: saved ? data.memories[0].id : null, saved }
	}

	async forget(id: string): Promise<void> {
		await this.request<void>(`/v1/memories/${encodeURIComponent(id)}`, {
			method: "DELETE",
		})
	}

	/**
	 * Forget by content when the caller doesn't know the memory's ID.
	 *
	 * Recall scores are reciprocal-rank-fusion values (max ≈ 0.03) and say
	 * nothing about how *close* a hit is, so they can't gate a delete. We
	 * instead score each candidate by token overlap (Sørensen–Dice) with
	 * the requested content and only delete a clear match — deleting the
	 * wrong memory is worse than reporting "not found".
	 */
	async forgetByContent(
		content: string,
		userId: string,
		sessionId?: string,
	): Promise<{ found: boolean; deletedText?: string; similarity?: number }> {
		const { hits } = await this.recall(content, userId, sessionId, 5)
		let best: { hit: MemoryHit; similarity: number } | null = null
		for (const hit of hits) {
			const similarity = tokenOverlap(content, hit.text)
			if (!best || similarity > best.similarity) best = { hit, similarity }
		}
		if (!best || best.similarity < FORGET_MIN_OVERLAP) {
			return { found: false }
		}
		await this.forget(best.hit.id)
		return {
			found: true,
			deletedText: limitByChars(best.hit.text, 100),
			similarity: best.similarity,
		}
	}
}

const FORGET_MIN_OVERLAP = 0.5
const segmenter = new Intl.Segmenter(undefined, { granularity: "word" })

function tokenSet(text: string): Set<string> {
	const out = new Set<string>()
	for (const { segment, isWordLike } of segmenter.segment(text)) {
		if (isWordLike) out.add(segment.toLowerCase())
	}
	return out
}

/** Sørensen–Dice coefficient over word tokens, in [0, 1]. Exported for tests. */
export function tokenOverlap(a: string, b: string): number {
	const ta = tokenSet(a)
	const tb = tokenSet(b)
	if (ta.size === 0 || tb.size === 0) return 0
	let shared = 0
	for (const t of ta) if (tb.has(t)) shared++
	return (2 * shared) / (ta.size + tb.size)
}
