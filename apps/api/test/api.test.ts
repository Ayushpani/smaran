import { beforeAll, describe, expect, test } from "bun:test"

// The API reads env at import time; configure sandbox mode first.
process.env.STORE = "memory"
process.env.EMBEDDER = "hash"
process.env.SANDBOX_API_KEY = "sk_test"

let fetchApp: (req: Request) => Promise<Response> | Response
beforeAll(async () => {
	const mod = await import("../src/index.ts")
	fetchApp = mod.default.fetch
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
