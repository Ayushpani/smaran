/**
 * Accounts, keys, plans and quotas against real Postgres (persistent mode).
 * Needs a migrated database: DATABASE_URL=… bun test test
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import postgres from "postgres"
import { createApp, type SmaranApp } from "../src/app.ts"
import { hashKey } from "../src/auth.ts"
import { parseEnv } from "../src/env.ts"

const url = process.env.DATABASE_URL
if (process.env.CI && !url) throw new Error("DATABASE_URL is required in CI")
const d = url ? describe : describe.skip

d("self-serve accounts (Postgres)", () => {
	let invite: SmaranApp
	let open: SmaranApp
	const sql = postgres(url ?? "postgres://unused", {
		max: 1,
		onnotice: () => {},
	})
	const created: string[] = []
	const base = {
		STORE: "supabase",
		DATABASE_URL: url,
		EMBEDDER: "hash",
		RERANKER: "none",
		FREE_MEMORY_QUOTA: "2",
		FREE_RATE_LIMIT_PER_MINUTE: "8",
		SIGNUP_PER_IP_PER_MINUTE: "50",
	}
	beforeAll(async () => {
		invite = await createApp(parseEnv({ ...base, SIGNUP_MODE: "invite" }))
		open = await createApp(parseEnv({ ...base, SIGNUP_MODE: "open" }))
	})
	afterAll(async () => {
		if (created.length)
			await sql`DELETE FROM tenants WHERE id IN ${sql(created)}`
		await Promise.all([invite.close(), open.close(), sql.end()])
	})

	const call = (
		a: SmaranApp,
		method: string,
		path: string,
		key?: string,
		body?: unknown,
		ip = "203.0.113.7",
	) =>
		a.app.fetch(
			new Request(`http://local${path}`, {
				method,
				headers: {
					"Content-Type": "application/json",
					"X-Forwarded-For": ip,
					...(key ? { Authorization: `Bearer ${key}` } : {}),
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		)
	async function signup(a: SmaranApp, body: Record<string, unknown>) {
		const res = await call(a, "POST", "/v1/signup", undefined, body)
		const json = (await res.json()) as any
		if (json.tenantId) created.push(json.tenantId)
		return { status: res.status, json }
	}

	test("invite mode: code required, single use, failed attempts create nothing", async () => {
		expect((await signup(invite, { name: "NoCode" })).status).toBe(403)
		const before = Number(
			(await sql`SELECT count(*)::int AS n FROM tenants`)[0]!.n,
		)
		expect(
			(await signup(invite, { name: "Bad", invite: "inv_nope" })).status,
		).toBe(403)
		expect(
			Number((await sql`SELECT count(*)::int AS n FROM tenants`)[0]!.n),
		).toBe(before)

		const code = `inv_test_${Math.random().toString(36).slice(2)}`
		await sql`INSERT INTO invites (code_hash) VALUES (${await hashKey(code)})`
		const ok = await signup(invite, {
			name: "Acme",
			email: "ops@acme.test",
			invite: code,
		})
		expect(ok.status).toBe(201)
		expect(ok.json.apiKey).toMatch(/^sk_[0-9a-f]{48}$/)
		expect(ok.json.limits).toEqual({ memories: 2, requestsPerMinute: 8 })
		expect((await signup(invite, { name: "Again", invite: code })).status).toBe(
			403,
		)
		expect(
			(await call(invite, "GET", "/v1/usage", ok.json.apiKey)).status,
		).toBe(200)
	})

	test("plan quota: saves stop with 402 at the memory limit; usage reports it", async () => {
		const { json } = await signup(open, { name: "Quota Co" })
		const save = (text: string) =>
			call(open, "POST", "/v1/memories", json.apiKey, { userId: "u", text })
		expect((await save("I live in Powai.")).status).toBe(200)
		expect((await save("My dog is called Bruno.")).status).toBe(200)
		const over = await save("I prefer tea over coffee.")
		expect(over.status).toBe(402)
		expect(((await over.json()) as any).error.code).toBe("quota_exceeded")
		const usage = (await (
			await call(open, "GET", "/v1/usage", json.apiKey)
		).json()) as any
		expect(usage).toMatchObject({
			plan: "free",
			memories: 2,
			limits: { memories: 2, requestsPerMinute: 8 },
		})
	})

	test("plan rate limit applies per tenant", async () => {
		const a = (await signup(open, { name: "Busy" })).json
		const b = (await signup(open, { name: "Quiet" })).json
		const statuses: number[] = []
		for (let i = 0; i < 10; i++)
			statuses.push((await call(open, "GET", "/v1/usage", a.apiKey)).status)
		expect(statuses.filter((s) => s === 429).length).toBe(2)
		expect((await call(open, "GET", "/v1/usage", b.apiKey)).status).toBe(200)
	})

	test("keys: create, list, revoke (effective immediately), never the last one", async () => {
		const { json } = await signup(open, { name: "Keys Inc" })
		const first = json.apiKey as string
		const made = (await (
			await call(open, "POST", "/v1/keys", first, { label: "backend" })
		).json()) as any
		const list = (await (
			await call(open, "GET", "/v1/keys", first)
		).json()) as any
		expect(list.keys).toHaveLength(2)
		expect(list.keys.find((k: any) => k.current).id).toBe(json.keyId)
		expect(JSON.stringify(list)).not.toContain(first)

		expect(
			(await call(open, "DELETE", `/v1/keys/${json.keyId}`, made.apiKey))
				.status,
		).toBe(204)
		expect((await call(open, "GET", "/v1/usage", first)).status).toBe(401)
		expect(
			(await call(open, "DELETE", `/v1/keys/${made.keyId}`, made.apiKey))
				.status,
		).toBe(409)
		// Another tenant can't touch these keys.
		const other = (await signup(open, { name: "Other" })).json
		expect(
			(await call(open, "DELETE", `/v1/keys/${made.keyId}`, other.apiKey))
				.status,
		).toBe(404)
	})

	test("signup is rate limited per IP", async () => {
		const strict = await createApp(
			parseEnv({ ...base, SIGNUP_MODE: "open", SIGNUP_PER_IP_PER_MINUTE: "2" }),
		)
		// Limiter state is shared in Postgres: use an address unique to this run.
		const ip = `198.51.100.9-${Date.now()}-${Math.random().toString(36).slice(2)}`
		try {
			const s: number[] = []
			for (let i = 0; i < 3; i++) {
				const res = await call(
					strict,
					"POST",
					"/v1/signup",
					undefined,
					{ name: `ip${i}` },
					ip,
				)
				const j = (await res.json()) as any
				if (j.tenantId) created.push(j.tenantId)
				s.push(res.status)
			}
			expect(s).toEqual([201, 201, 429])
		} finally {
			await strict.close()
		}
	})

	test("OpenAPI documents every persistent-mode route", async () => {
		const spec = (await (
			await call(open, "GET", "/openapi.json")
		).json()) as any
		const documented = new Set(
			Object.entries(spec.paths).flatMap(([p, ops]: any) =>
				Object.keys(ops).map((m) => `${m} ${p}`),
			),
		)
		const mounted = open.app.routes
			.filter((r) => r.path.startsWith("/v1/") && r.method !== "ALL")
			.map(
				(r) =>
					`${r.method.toLowerCase()} ${r.path.replace(/:(\w+)/g, "{$1}").replace(/\/$/, "")}`,
			)
		expect([...new Set(mounted)].filter((r) => !documented.has(r))).toEqual([])
	})
})
