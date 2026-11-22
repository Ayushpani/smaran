/** Browser-side helpers for talking to a Smaran API from the site. */

export const DEFAULT_API = (
	process.env.NEXT_PUBLIC_SMARAN_API_URL ?? ""
).replace(/\/$/, "")

const SESSION_KEY = "smaran-console"

export interface Session {
	url: string
	key: string
	/** "account" when the server has accounts (persistent mode), "sandbox" otherwise. */
	mode: "account" | "sandbox"
}

export function loadSession(): Session | null {
	try {
		const raw = sessionStorage.getItem(SESSION_KEY)
		if (!raw) return null
		const s = JSON.parse(raw) as Session
		return s.url && s.key ? s : null
	} catch {
		return null
	}
}

export function saveSession(s: Session) {
	try {
		sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
	} catch {}
}

export function clearSession() {
	try {
		sessionStorage.removeItem(SESSION_KEY)
	} catch {}
}

export interface ApiResult<T> {
	ok: boolean
	status: number
	data: T
	message: string
}

export async function api<T = unknown>(
	url: string,
	key: string | null,
	method: string,
	path: string,
	body?: unknown,
): Promise<ApiResult<T>> {
	let res: Response
	try {
		res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
			method,
			headers: {
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
				...(key ? { Authorization: `Bearer ${key}` } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		})
	} catch {
		return {
			ok: false,
			status: 0,
			data: {} as T,
			message: `Couldn't reach ${url}. Check the address, and that the server allows this site (CORS_ORIGIN).`,
		}
	}
	const data = (
		res.status === 204 ? {} : await res.json().catch(() => ({}))
	) as T & {
		error?: { message?: string }
	}
	return {
		ok: res.ok,
		status: res.status,
		data,
		message: res.ok
			? ""
			: (data?.error?.message ?? `Request failed (HTTP ${res.status}).`),
	}
}

export interface Usage {
	tenantId: string
	plan: string
	memories: number
	limits: { memories: number | null; requestsPerMinute: number | null }
}

export interface KeyRow {
	id: string
	label: string | null
	createdAt: string
	revokedAt: string | null
	current: boolean
}

export interface Memory {
	id: string
	text: string
	kind: string
	createdAt: string
	supersedesId: string | null
	metadata: {
		originalText?: string
		corrections?: {
			kind: "replace" | "patch"
			retracted: string
			kept: string
		}[]
		language?: string
		[k: string]: unknown
	}
}

export interface Hit {
	memory: Memory
	score: number
	tier: string
	channels?: Partial<Record<"dense" | "keyword" | "graph" | "temporal", number>>
}

export interface RecallResult {
	hits: Hit[]
	latencyMs: { total: number; embed: number; search: number; rerank: number }
	reranker?: string
}
