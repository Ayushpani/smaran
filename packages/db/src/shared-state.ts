import {
	createInProcessEventBus,
	type EventBus,
	type MemoryEvent,
} from "@repo/core"
import { sql } from "drizzle-orm"
import postgres from "postgres"
import type { Db } from "./client.ts"

/**
 * Postgres-backed shared state, so N API instances behave like one
 * without adding Redis or any other paid service.
 */

// ── Live events: LISTEN/NOTIFY ────────────────────────────────────────

const CHANNEL = "smaran_events"
// NOTIFY payloads must stay under 8000 bytes.
const MAX_PAYLOAD = 7800

export interface PgEventBus extends EventBus {
	/** Resolves once this instance is listening. */
	ready: Promise<void>
	close(): Promise<void>
}

/**
 * Every instance LISTENs on one channel and fans notifications out to its
 * own local subscribers; `publish` only NOTIFYs (this instance receives
 * its own notification too, so nothing is delivered twice).
 *
 * Needs a session-mode connection: LISTEN does not work through a
 * transaction pooler (e.g. Supabase port 6543) — pass the direct URL.
 */
export function createPgEventBus(url: string): PgEventBus {
	const client = postgres(url, { max: 2, onnotice: () => {} })
	const local = createInProcessEventBus()
	const ready = client
		.listen(CHANNEL, (payload) => {
			try {
				const msg = JSON.parse(payload) as {
					t: string
					s: string
					e: MemoryEvent
				}
				local.publish(msg.t, msg.s, msg.e)
			} catch {
				// Malformed payload: ignore.
			}
		})
		.then(() => undefined)

	return {
		ready,
		async publish(tenantId, sessionId, event) {
			if (sessionId === null) return
			await ready
			await client`SELECT pg_notify(${CHANNEL}, ${encode(tenantId, sessionId, event)})`
		},
		subscribe: (tenantId, sessionId) => local.subscribe(tenantId, sessionId),
		async close() {
			await client.end({ timeout: 5 })
		},
	}
}

/** Fit the event in a NOTIFY payload: drop bulky metadata first, then truncate text. */
function encode(t: string, s: string, e: MemoryEvent): string {
	let payload = JSON.stringify({ t, s, e })
	if (payload.length <= MAX_PAYLOAD || e.type !== "memory.saved") return payload
	const slim = { ...e, memory: { ...e.memory, metadata: { truncated: true } } }
	payload = JSON.stringify({ t, s, e: slim })
	if (payload.length <= MAX_PAYLOAD) return payload
	const over = payload.length - MAX_PAYLOAD + 16
	slim.memory.text = `${slim.memory.text.slice(0, Math.max(0, slim.memory.text.length - over))}…`
	return JSON.stringify({ t, s, e: slim })
}

// ── Streaming-voice turn buffers ──────────────────────────────────────

export interface IngestBuffers {
	/** Merge a partial transcript into the turn buffer; returns the buffer length. */
	append(tenantId: string, sessionId: string, text: string): Promise<number>
	/** Take (and clear) the turn buffer. */
	take(tenantId: string, sessionId: string): Promise<string>
	/** Open turns for one tenant. */
	stats(tenantId: string): Promise<{ sessions: number }>
}

/**
 * Streaming ASR sends growing prefixes, so a partial that extends the
 * buffer replaces it, one already contained at its end is ignored, and
 * anything else is appended — the same rule as the in-memory buffer, but
 * evaluated atomically in one upsert so instances can't race.
 */
export function createPgIngestBuffers(
	db: Db,
	opts: { staleAfterMs?: number } = {},
): IngestBuffers {
	const staleMs = opts.staleAfterMs ?? 60 * 60 * 1000
	let lastSweep = 0
	const sweep = async () => {
		const now = Date.now()
		if (now - lastSweep < 60_000) return
		lastSweep = now
		await db.execute(
			sql`DELETE FROM ingest_buffers WHERE updated_at < now() - make_interval(secs => ${staleMs / 1000})`,
		)
	}
	return {
		async append(tenantId, sessionId, text) {
			void sweep().catch(() => {})
			const rows = (await db.execute(sql`
				INSERT INTO ingest_buffers (tenant_id, session_id, text, updated_at)
				VALUES (${tenantId}, ${sessionId}, ${text}, now())
				ON CONFLICT (tenant_id, session_id) DO UPDATE SET
					text = CASE
						WHEN starts_with(EXCLUDED.text, ingest_buffers.text) THEN EXCLUDED.text
						WHEN right(ingest_buffers.text, length(EXCLUDED.text)) = EXCLUDED.text THEN ingest_buffers.text
						ELSE ingest_buffers.text || ' ' || EXCLUDED.text
					END,
					updated_at = now()
				RETURNING length(text) AS len
			`)) as unknown as Array<{ len: number }>
			return Number(rows[0]?.len ?? 0)
		},
		async take(tenantId, sessionId) {
			const rows = (await db.execute(sql`
				DELETE FROM ingest_buffers WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
				RETURNING text
			`)) as unknown as Array<{ text: string }>
			return rows[0]?.text ?? ""
		},
		async stats(tenantId) {
			const rows = (await db.execute(
				sql`SELECT count(*)::int AS n FROM ingest_buffers WHERE tenant_id = ${tenantId}`,
			)) as unknown as Array<{ n: number }>
			return { sessions: Number(rows[0]?.n ?? 0) }
		},
	}
}

// ── Rate limiting ─────────────────────────────────────────────────────

export interface RateLimitDecision {
	allowed: boolean
	remaining: number
	/** Seconds until the caller may retry (when not allowed). */
	retryAfter: number
}

export interface RateLimitStore {
	hit(key: string, limitPerMinute: number): Promise<RateLimitDecision>
}

/**
 * Fixed one-minute windows shared by all instances: one atomic upsert per
 * request. Keys are SHA-256 hashed so raw API keys never reach the table.
 */
export function createPgRateLimitStore(db: Db): RateLimitStore {
	let lastSweep = 0
	return {
		async hit(key, limit) {
			const now = Date.now()
			if (now - lastSweep > 60_000) {
				lastSweep = now
				void db
					.execute(
						sql`DELETE FROM rate_limit_windows WHERE window_start < now() - interval '5 minutes'`,
					)
					.catch(() => {})
			}
			const rows = (await db.execute(sql`
				INSERT INTO rate_limit_windows (key_hash, window_start, count)
				VALUES (${await sha256(key)}, date_trunc('minute', now()), 1)
				ON CONFLICT (key_hash, window_start) DO UPDATE SET count = rate_limit_windows.count + 1
				RETURNING count, extract(epoch FROM (date_trunc('minute', now()) + interval '1 minute' - now()))::float AS reset_in
			`)) as unknown as Array<{ count: number; reset_in: number }>
			const count = Number(rows[0]?.count ?? 1)
			return {
				allowed: count <= limit,
				remaining: Math.max(0, limit - count),
				retryAfter: Math.max(1, Math.ceil(Number(rows[0]?.reset_in ?? 60))),
			}
		},
	}
}

async function sha256(s: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
	return Array.from(new Uint8Array(buf), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("")
}
