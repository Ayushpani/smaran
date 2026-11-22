import type { Db } from "@repo/db"
import { schema } from "@repo/db"
import { and, eq, isNull } from "drizzle-orm"
import type { Context, MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"

export interface AuthContext {
	tenantId: string
	apiKeyId: string
	plan?: string
	/** Max stored memories; null/undefined = unlimited. */
	memoryQuota?: number | null
	/** Requests per minute; null/undefined = server default. */
	rateLimitPerMinute?: number | null
}

declare module "hono" {
	interface ContextVariableMap {
		auth: AuthContext
	}
}

async function hashKey(key: string): Promise<string> {
	const enc = new TextEncoder().encode(key)
	const buf = await crypto.subtle.digest("SHA-256", enc)
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

/**
 * Bearer API-key auth against the hashed `api_keys` table. Lookups are
 * cached in-process for KEY_CACHE_TTL_MS (hits AND misses) so the hot path
 * doesn't pay a database round trip per request; a revoked key therefore
 * stops working within that window, not instantly.
 */
const KEY_CACHE_TTL_MS = 30_000
const KEY_CACHE_MAX = 10_000

export interface ApiKeyAuth extends MiddlewareHandler {
	/** Drop a key from this instance's cache (e.g. right after revoking it). */
	evict(apiKeyId: string): void
}

export function apiKeyAuth(db: Db): ApiKeyAuth {
	const cache = new Map<
		string,
		{ value: AuthContext | null; expiresAt: number }
	>()
	const middleware: MiddlewareHandler = async (c, next) => {
		const token = readBearer(c)
		const hashed = await hashKey(token)
		const now = Date.now()
		let entry = cache.get(hashed)
		if (!entry || entry.expiresAt <= now) {
			const [row] = await db
				.select({
					id: schema.apiKeys.id,
					tenantId: schema.apiKeys.tenantId,
					plan: schema.tenants.plan,
					memoryQuota: schema.tenants.memoryQuota,
					rateLimitPerMinute: schema.tenants.rateLimitPerMinute,
				})
				.from(schema.apiKeys)
				.innerJoin(
					schema.tenants,
					eq(schema.tenants.id, schema.apiKeys.tenantId),
				)
				.where(
					and(
						eq(schema.apiKeys.hashedKey, hashed),
						isNull(schema.apiKeys.revokedAt),
					),
				)
				.limit(1)
			entry = {
				value: row
					? {
							tenantId: row.tenantId,
							apiKeyId: row.id,
							plan: row.plan,
							memoryQuota: row.memoryQuota,
							rateLimitPerMinute: row.rateLimitPerMinute,
						}
					: null,
				expiresAt: now + KEY_CACHE_TTL_MS,
			}
			if (cache.size >= KEY_CACHE_MAX) cache.clear()
			cache.set(hashed, entry)
		}
		if (!entry.value)
			throw new HTTPException(401, { message: "invalid api key" })
		c.set("auth", entry.value)
		await next()
	}
	return Object.assign(middleware, {
		evict(apiKeyId: string) {
			for (const [k, v] of cache)
				if (v.value?.apiKeyId === apiKeyId) cache.delete(k)
		},
	})
}

/** SHA-256 hex of an API key — the only form keys are stored in. */
export { hashKey }

/**
 * Sandbox auth — one hardcoded key = one tenant. Used only when
 * STORE=memory. Prints the key on startup so first-time users can
 * grab it from the console.
 */
export function sandboxAuth(apiKey: string): MiddlewareHandler {
	return async (c, next) => {
		const token = readBearer(c)
		if (token !== apiKey) {
			throw new HTTPException(401, { message: "invalid api key" })
		}
		c.set("auth", { tenantId: "ten_sandbox", apiKeyId: "key_sandbox" })
		await next()
	}
}

function readBearer(c: Context): string {
	const raw = c.req.header("Authorization")
	if (!raw?.startsWith("Bearer ")) {
		throw new HTTPException(401, { message: "missing bearer token" })
	}
	const token = raw.slice(7).trim()
	if (!token) throw new HTTPException(401, { message: "empty token" })
	return token
}

export function auth(c: Context): AuthContext {
	return c.get("auth")
}
