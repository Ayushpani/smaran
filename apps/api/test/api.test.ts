import { beforeAll, describe, expect, test } from "bun:test"

// The API reads env at import time; configure sandbox mode first.
process.env.STORE = "memory"
process.env.EMBEDDER = "hash"
process.env.SANDBOX_API_KEY = "sk_test"
process.env.RATE_LIMIT_PER_MINUTE = "40"
process.env.MAX_BODY_BYTES = "2048"

let fetchApp: (req: Request) => Promise<Response> | Response
beforeAll(async () => {
	const mod = await import("../src/index.ts")
	fetchApp = mod.handler
})

function call(path: string, body?: unknown, key = "sk_test") {
	return fetchApp(
		new Request(`http://local${path}`, {
			method: body === undefined ? "GET" : "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	)
}

describe("api", () => {
	test("rejects a bad key", async () => {
		const res = await call("/v1/recall", { query: "x" }, "wrong")
		expect(res.status).toBe(401)
	})

	test("voice commit preserves preferences and applies self-correction", async () => {
		const res = await call("/v1/ingest/commit", {
			sessionId: "v1",
			userId: "u",
			text: "um I like dark mode",
		})
		const json = (await res.json()) as { saved: boolean; text: string }
		expect(json.saved).toBe(true)
		expect(json.text).toBe("I like dark mode")

		const corrected = (await (
			await call("/v1/ingest/commit", {
				sessionId: "v1",
				userId: "u",
				text: "my name is Ayush, sorry Ayushpani",
			})
		).json()) as { text: string }
		expect(corrected.text).toBe("Ayushpani")
	})

	test("voice and text paths both skip confirmation questions", async () => {
		const text = (await (
			await call("/v1/memories", { text: "is that 13 or 913?" })
		).json()) as {
			skipped?: string
		}
		expect(text.skipped).toBe("question-or-tooshort")
		const voice = (await (
			await call("/v1/ingest/commit", {
				sessionId: "v2",
				text: "is that 13 or 913?",
			})
		).json()) as { saved: boolean }
		expect(voice.saved).toBe(false)
	})
})

describe("hardening", () => {
	test("errors use one JSON shape with a request id", async () => {
		const res = await call("/v1/recall", { query: "x" }, "wrong")
		const body = (await res.json()) as {
			error: { code: string; requestId: string }
		}
		expect(body.error.code).toBe("unauthorized")
		expect(body.error.requestId).toBe(res.headers.get("x-request-id")!)
	})

	test("validation errors name the field, never echo values", async () => {
		const res = await call("/v1/recall", { query: "", topK: 999 })
		expect(res.status).toBe(400)
		const body = (await res.json()) as {
			error: { code: string; message: string }
		}
		expect(body.error.code).toBe("invalid_request")
		expect(body.error.message).toContain("query")
		expect(body.error.message).toContain("topK")
	})

	test("unknown routes return JSON 404", async () => {
		const res = await call("/v1/nope")
		expect(res.status).toBe(404)
		expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
			"not_found",
		)
	})

	test("oversized bodies are rejected with 413", async () => {
		const res = await call("/v1/memories", { text: "x".repeat(5000) })
		expect(res.status).toBe(413)
	})

	test("rate limit returns 429 with Retry-After per key", async () => {
		let limited: Response | undefined
		for (let i = 0; i < 45 && !limited; i++) {
			const r = await call("/v1/recall", { query: "x" }, "burst-key")
			if (r.status === 429) limited = r
		}
		expect(limited).toBeDefined()
		expect(Number(limited!.headers.get("retry-after"))).toBeGreaterThan(0)
		// A different key is unaffected.
		expect((await call("/v1/recall", { query: "hello there" })).status).toBe(
			200,
		)
	})
})
