/**
 * Zero-dependency TypeScript client for the Smaran API. Works in Node 18+,
 * Bun, Deno, Cloudflare Workers and browsers (anything with `fetch`).
 *
 *   const smaran = new Smaran({ apiKey: process.env.SMARAN_API_KEY!, baseUrl: "http://localhost:8787" })
 *   await smaran.save({ userId: "u1", text: "I prefer window seats." })
 *   const { hits } = await smaran.recall({ userId: "u1", query: "seat preference" })
 *
 * Retries 429 and 5xx responses (and network errors) with exponential
 * backoff, honouring Retry-After. Every failure throws SmaranError with
 * the server's error code and request id.
 */

export interface SmaranMemory {
	id: string
	tenantId: string
	userId: string | null
	sessionId: string | null
	text: string
	kind: "fact" | "preference" | "event" | "entity"
	source: "text" | "voice"
	createdAt: string
	updatedAt: string
	metadata: Record<string, unknown>
	validFrom: string
	validUntil: string | null
	/** The memory this one revises, if any. */
	supersedesId: string | null
	confidenceAlpha: number
	confidenceBeta: number
	accessCount: number
	lastAccessedAt: string | null
}

export interface SmaranRecallHit {
	memory: SmaranMemory
	/** For ordering only — not a calibrated probability. */
	score: number
	tier: "hot" | "session" | "cross"
	channels?: Partial<Record<"dense" | "keyword" | "graph" | "temporal", number>>
}

export interface SmaranRecallResult {
	hits: SmaranRecallHit[]
	latencyMs: { total: number; embed: number; search: number; rerank: number }
	reranker?: string
	rerankerSource?: string
}

export interface SmaranSaveOptions {
	text: string
	userId?: string
	sessionId?: string
	source?: "text" | "voice"
	metadata?: Record<string, unknown>
}

export interface SmaranSaveResult {
	memories: SmaranMemory[]
	/** Set when nothing was stored, e.g. a pure confirmation question. */
	skipped?: "question-or-tooshort"
}

export interface SmaranRecallOptions {
	query: string
	userId?: string
	sessionId?: string
	topK?: number
	includeCrossSession?: boolean
	rerank?: boolean
	/** Point-in-time recall (ISO timestamp). */
	asOf?: string
}

export interface SmaranCommitResult {
	saved: boolean
	reason?: string
	text?: string
	memories?: SmaranMemory[]
}

export interface SmaranProfile {
	summary: string
	confidence: number
	sourceMemoryIds: string[]
	updatedAt: string
}

export interface SmaranOptions {
	apiKey: string
	/** Defaults to http://localhost:8787. */
	baseUrl?: string
	fetch?: typeof fetch
	/** Per-attempt timeout in ms (default 10 000). */
	timeoutMs?: number
	/** Retries for 429 / 5xx / network errors (default 2). */
	maxRetries?: number
}

export class SmaranError extends Error {
	constructor(
		message: string,
		/** HTTP status, or 0 for network/timeout errors. */
		readonly status: number,
		/** Server error code, e.g. "invalid_request", "rate_limited", "unauthorized". */
		readonly code: string,
		/** Server request id — include it when reporting a problem. */
		readonly requestId?: string,
	) {
		super(message)
		this.name = "SmaranError"
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class Smaran {
	private readonly baseUrl: string
	private readonly headers: Record<string, string>
	private readonly fetchFn: typeof fetch
	private readonly timeoutMs: number
	private readonly maxRetries: number

	constructor(opts: SmaranOptions) {
		if (!opts.apiKey) throw new Error("Smaran: apiKey is required")
		this.baseUrl = (opts.baseUrl ?? "http://localhost:8787").replace(/\/$/, "")
		this.headers = {
			Authorization: `Bearer ${opts.apiKey}`,
			"Content-Type": "application/json",
		}
		this.fetchFn = opts.fetch ?? fetch
		this.timeoutMs = opts.timeoutMs ?? 10_000
		this.maxRetries = opts.maxRetries ?? 2
	}

	/** Save a memory. Returns stored (or corroborated) memories. */
	async save(opts: SmaranSaveOptions): Promise<SmaranMemory[]> {
		return (await this.saveDetailed(opts)).memories
	}

	/** Like save(), but also tells you when and why nothing was stored. */
	saveDetailed(opts: SmaranSaveOptions): Promise<SmaranSaveResult> {
		return this.request("POST", "/v1/memories", opts)
	}

	recall(opts: SmaranRecallOptions): Promise<SmaranRecallResult> {
		return this.request("POST", "/v1/recall", opts)
	}

	async forget(id: string): Promise<void> {
		await this.request("DELETE", `/v1/memories/${encodeURIComponent(id)}`)
	}

	/** Voice: append a partial (streaming) transcript for a session. */
	ingestPartial(opts: {
		sessionId: string
		text: string
		userId?: string
	}): Promise<{
		sessionId: string
		bufferLen: number
	}> {
		return this.request("POST", "/v1/ingest/partial", opts)
	}

	/** Voice: finalize the buffered turn (or pass `text`) and save it. */
	ingestCommit(opts: {
		sessionId: string
		userId?: string
		text?: string
		source?: "text" | "voice"
	}): Promise<SmaranCommitResult> {
		return this.request("POST", "/v1/ingest/commit", opts)
	}

	/** Persistent mode: the user's consolidated profile, or null if none yet. */
	async profile(userId: string): Promise<SmaranProfile | null> {
		try {
			return await this.request(
				"GET",
				`/v1/profile?userId=${encodeURIComponent(userId)}`,
			)
		} catch (err) {
			if (err instanceof SmaranError && err.status === 404) return null
			throw err
		}
	}

	consolidateProfile(userId: string): Promise<Record<string, unknown>> {
		return this.request(
			"POST",
			`/v1/profile/consolidate?userId=${encodeURIComponent(userId)}`,
		)
	}

	/** Persistent mode: erase all of a user's memories, sessions and profile. */
	forgetUser(userId: string): Promise<Record<string, unknown>> {
		return this.request("POST", "/v1/dpdp/right-to-forget", { userId })
	}

	/** Persistent mode: export everything stored about a user. */
	exportUser(userId: string): Promise<Record<string, unknown>> {
		return this.request(
			"GET",
			`/v1/dpdp/export?userId=${encodeURIComponent(userId)}`,
		)
	}

	/** Persistent mode: append a consent grant/withdrawal to the consent log. */
	recordConsent(opts: {
		userId: string
		kind: "record" | "process" | "retain" | "share"
		granted: boolean
		scope?: string
		sessionId?: string
	}): Promise<Record<string, unknown>> {
		return this.request("POST", "/v1/dpdp/consent", opts)
	}

	/** Live memory events for a session (Server-Sent Events). */
	async *subscribe(
		sessionId: string,
		signal?: AbortSignal,
	): AsyncIterable<unknown> {
		const res = await this.fetchFn(
			`${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/subscribe`,
			{ headers: this.headers, signal },
		)
		if (!res.ok || !res.body) throw await toError(res)
		const reader = res.body.getReader()
		const decoder = new TextDecoder()
		let buf = ""
		while (true) {
			const { done, value } = await reader.read()
			if (done) return
			buf += decoder.decode(value, { stream: true })
			const parts = buf.split("\n\n")
			buf = parts.pop() ?? ""
			for (const part of parts) {
				const dataLine = part.split("\n").find((l) => l.startsWith("data:"))
				if (dataLine) yield JSON.parse(dataLine.slice(5).trim())
			}
		}
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
	): Promise<T> {
		let attempt = 0
		while (true) {
			const ctrl = new AbortController()
			const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
			let res: Response
			try {
				res = await this.fetchFn(`${this.baseUrl}${path}`, {
					method,
					headers: this.headers,
					body: body === undefined ? undefined : JSON.stringify(body),
					signal: ctrl.signal,
				})
			} catch (err) {
				clearTimeout(timer)
				if (attempt < this.maxRetries) {
					await sleep(backoff(attempt++))
					continue
				}
				const timedOut = ctrl.signal.aborted
				throw new SmaranError(
					timedOut
						? `smaran: timed out after ${this.timeoutMs}ms`
						: `smaran: network error: ${String(err)}`,
					0,
					timedOut ? "timeout" : "network_error",
				)
			}
			clearTimeout(timer)
			if (res.ok) {
				return (res.status === 204 ? null : await res.json()) as T
			}
			const retryable = res.status === 429 || res.status >= 500
			if (retryable && attempt < this.maxRetries) {
				const after = Number(res.headers.get("retry-after"))
				await sleep(
					after > 0 ? Math.min(after * 1000, 30_000) : backoff(attempt),
				)
				attempt++
				continue
			}
			throw await toError(res)
		}
	}
}

function backoff(attempt: number): number {
	return Math.min(250 * 2 ** attempt, 4_000) + Math.random() * 100
}

async function toError(res: Response): Promise<SmaranError> {
	let code = "error"
	let message = `smaran: HTTP ${res.status}`
	let requestId = res.headers.get("x-request-id") ?? undefined
	try {
		const json = (await res.json()) as {
			error?: { code?: string; message?: string; requestId?: string }
		}
		if (json.error) {
			code = json.error.code ?? code
			message = `smaran: ${json.error.message ?? message}`
			requestId = json.error.requestId ?? requestId
		}
	} catch {
		// Non-JSON body — keep the generic message.
	}
	return new SmaranError(message, res.status, code, requestId)
}
