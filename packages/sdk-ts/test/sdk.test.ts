import { beforeAll, describe, expect, test } from "bun:test"
import { Smaran, SmaranError } from "../src/index.ts"

describe("retries and errors", () => {
	test("retries 429/503 then succeeds, honouring Retry-After", async () => {
		const statuses = [429, 503, 200]
		let calls = 0
		const fetchFn = (async () => {
			const status = statuses[calls++]!
			return status === 200
				? Response.json({ hits: [], latencyMs: {} })
				: new Response("{}", { status, headers: { "retry-after": "0" } })
		}) as unknown as typeof fetch
		const s = new Smaran({ apiKey: "k", fetch: fetchFn, maxRetries: 2 })
		await s.recall({ query: "x" })
		expect(calls).toBe(3)
	})

	test("does not retry 4xx and surfaces the server error code and request id", async () => {
		let calls = 0
		const fetchFn = (async () => {
			calls++
			return Response.json(
				{
					error: {
						code: "invalid_request",
						message: "query: required",
						requestId: "req_1",
					},
				},
				{ status: 400 },
			)
		}) as unknown as typeof fetch
		const s = new Smaran({ apiKey: "k", fetch: fetchFn })
		const err = (await s.recall({ query: "" }).catch((e) => e)) as SmaranError
		expect(err).toBeInstanceOf(SmaranError)
		expect(err.code).toBe("invalid_request")
		expect(err.requestId).toBe("req_1")
		expect(calls).toBe(1)
	})

	test("times out with code 'timeout'", async () => {
		const fetchFn = ((_: string, init: RequestInit) =>
			new Promise((_, reject) =>
				init.signal?.addEventListener("abort", () =>
					reject(new Error("aborted")),
				),
			)) as unknown as typeof fetch
		const s = new Smaran({
			apiKey: "k",
			fetch: fetchFn,
			timeoutMs: 20,
			maxRetries: 0,
		})
		const err = (await s.recall({ query: "x" }).catch((e) => e)) as SmaranError
		expect(err.code).toBe("timeout")
	})
})

describe("against the real API (sandbox)", () => {
	let smaran: Smaran
	beforeAll(async () => {
		process.env.STORE = "memory"
		process.env.EMBEDDER = "hash"
		process.env.SANDBOX_API_KEY = "sk_sdk"
		const { handler } = await import("../../../apps/api/src/index.ts")
		const fetchFn = ((url: string, init?: RequestInit) =>
			handler(new Request(url, init))) as unknown as typeof fetch
		smaran = new Smaran({
			apiKey: "sk_sdk",
			baseUrl: "http://api",
			fetch: fetchFn,
		})
	})

	test("save → recall → forget round trip", async () => {
		const [m] = await smaran.save({
			userId: "u",
			text: "My dog is called Bruno.",
		})
		const { hits } = await smaran.recall({ userId: "u", query: "Bruno" })
		expect(hits[0]?.memory.id).toBe(m!.id)
		await smaran.forget(m!.id)
		expect(
			(await smaran.recall({ userId: "u", query: "Bruno" })).hits,
		).toHaveLength(0)
	})

	test("saveDetailed reports skipped confirmation questions", async () => {
		const r = await smaran.saveDetailed({
			userId: "u",
			text: "is that 13 or 913?",
		})
		expect(r.skipped).toBe("question-or-tooshort")
	})

	test("voice ingest: partials then commit", async () => {
		await smaran.ingestPartial({ sessionId: "s", text: "my room number" })
		await smaran.ingestPartial({
			sessionId: "s",
			text: "my room number is 913",
		})
		const r = await smaran.ingestCommit({ sessionId: "s", userId: "u" })
		expect(r.saved).toBe(true)
		expect(r.text).toBe("my room number is 913")
	})

	test("bad key throws SmaranError(401, unauthorized)", async () => {
		const { handler } = await import("../../../apps/api/src/index.ts")
		const bad = new Smaran({
			apiKey: "wrong",
			baseUrl: "http://api",
			fetch: ((u: string, i?: RequestInit) =>
				handler(new Request(u, i))) as unknown as typeof fetch,
		})
		const err = (await bad
			.recall({ query: "x" })
			.catch((e) => e)) as SmaranError
		expect(err.status).toBe(401)
		expect(err.code).toBe("unauthorized")
	})
})
