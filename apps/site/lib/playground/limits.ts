/**
 * Best-effort per-visitor limits for the free playground. In memory, per
 * server instance; the Smaran tenant's own rate limit is the global cap.
 */
const DAY = 24 * 60 * 60 * 1000
const buckets = new Map<string, { n: number; reset: number }>()

export const LIMITS = {
	turnsPerVisitorPerDay: 60,
	turnsPerIpPerDay: 150,
	messageChars: 400,
}

export function take(key: string, max: number): boolean {
	const now = Date.now()
	const b = buckets.get(key)
	if (!b || b.reset < now) {
		buckets.set(key, { n: 1, reset: now + DAY })
		if (buckets.size > 50_000)
			for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k)
		return true
	}
	if (b.n >= max) return false
	b.n++
	return true
}

export function clientIp(req: Request): string {
	return (
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		"unknown"
	)
}

/** Visitor IDs come from the browser: keep them to a safe shape. */
export const validVisitor = (v: unknown): v is string =>
	typeof v === "string" && /^[a-z0-9]{8,40}$/.test(v)
