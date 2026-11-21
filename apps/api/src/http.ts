import { zValidator } from "@hono/zod-validator"
import type { Context, MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"

/**
 * Cross-cutting HTTP concerns: request IDs, structured access logs,
 * consistent JSON errors, and per-key rate limiting.
 *
 * Logs never contain request/response bodies, memory text, embeddings or
 * SQL parameters — those carry end-user personal data. Drizzle errors in
 * particular embed every bound parameter in `message`, so only the error
 * class and the Postgres error code are logged for unexpected errors.
 */

declare module "hono" {
	interface ContextVariableMap {
		requestId: string
	}
}

export interface ErrorBody {
	error: { code: string; message: string; requestId: string }
}

function log(entry: Record<string, unknown>) {
	console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }))
}

/** Assigns X-Request-Id (honouring a sane incoming one) and writes one JSON access-log line per request. */
export function requestContext(): MiddlewareHandler {
	return async (c, next) => {
		const incoming = c.req.header("x-request-id")
		const requestId =
			incoming && /^[\w.-]{1,128}$/.test(incoming)
				? incoming
				: crypto.randomUUID()
		c.set("requestId", requestId)
		c.header("X-Request-Id", requestId)
		const t0 = performance.now()
		await next()
		const auth = c.get("auth") as { tenantId?: string } | undefined
		log({
			level: "info",
			msg: "request",
			requestId,
			method: c.req.method,
			path: c.req.path,
			status: c.res.status,
			ms: Math.round(performance.now() - t0),
			tenantId: auth?.tenantId,
		})
	}
}

export function errorBody(
	c: Context,
	code: string,
	message: string,
): ErrorBody {
	return { error: { code, message, requestId: c.get("requestId") ?? "" } }
}

const STATUS_CODES: Record<number, string> = {
	400: "bad_request",
	401: "unauthorized",
	403: "forbidden",
	404: "not_found",
	413: "payload_too_large",
	429: "rate_limited",
}

/** Hono onError handler: HTTPException → its status; anything else → 500 with no internals exposed. */
export function onError(err: Error, c: Context) {
	if (err instanceof HTTPException) {
		const status = err.status
		return c.json(
			errorBody(c, STATUS_CODES[status] ?? "error", err.message || "error"),
			status,
		)
	}
	const cause = (err as { cause?: { code?: string } }).cause
	log({
		level: "error",
		msg: "unhandled",
		requestId: c.get("requestId"),
		path: c.req.path,
		error: err.name,
		pgCode: cause?.code,
	})
	return c.json(errorBody(c, "internal_error", "internal server error"), 500)
}

export function notFound(c: Context) {
	return c.json(errorBody(c, "not_found", "no such route"), 404)
}

/**
 * Turns zod validation failures into the standard error shape, listing
 * the offending fields (names and messages only — never values).
 */
export function validationHook(
	result: {
		success: boolean
		error?: { issues: Array<{ path: PropertyKey[]; message: string }> }
	},
	c: Context,
) {
	if (result.success) return
	const detail = (result.error?.issues ?? [])
		.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
		.join("; ")
	return c.json(
		errorBody(c, "invalid_request", detail || "invalid request"),
		400,
	)
}

/**
 * Token-bucket rate limiter keyed by API key (falls back to client IP
 * before auth). In-process: correct for a single instance; a multi-
 * instance deployment needs a shared store behind the same interface.
 */
export function rateLimit(opts: {
	perMinute: number
	key: (c: Context) => string
}): MiddlewareHandler {
	const capacity = Math.max(1, opts.perMinute)
	const refillPerMs = capacity / 60_000
	const buckets = new Map<string, { tokens: number; at: number }>()
	let lastSweep = Date.now()

	return async (c, next) => {
		const now = Date.now()
		// Drop idle buckets so memory stays bounded by active keys.
		if (now - lastSweep > 60_000) {
			for (const [k, b] of buckets) if (now - b.at > 120_000) buckets.delete(k)
			lastSweep = now
		}
		const k = opts.key(c)
		const b = buckets.get(k) ?? { tokens: capacity, at: now }
		b.tokens = Math.min(capacity, b.tokens + (now - b.at) * refillPerMs)
		b.at = now
		buckets.set(k, b)
		c.header("RateLimit-Limit", String(capacity))
		if (b.tokens < 1) {
			const retry = Math.ceil((1 - b.tokens) / refillPerMs / 1000)
			c.header("Retry-After", String(retry))
			c.header("RateLimit-Remaining", "0")
			return c.json(errorBody(c, "rate_limited", "rate limit exceeded"), 429)
		}
		b.tokens -= 1
		c.header("RateLimit-Remaining", String(Math.floor(b.tokens)))
		await next()
	}
}

/** zValidator with the standard error shape — use instead of zValidator directly. */
export function validate<
	T extends "json" | "query" | "param",
	S extends import("zod").ZodTypeAny,
>(target: T, schema: S) {
	return zValidator(target, schema, validationHook as never)
}
