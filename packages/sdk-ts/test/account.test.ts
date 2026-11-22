import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Smaran, type SmaranError } from "../src/index.ts"

const url = process.env.DATABASE_URL
if (process.env.CI && !url) throw new Error("DATABASE_URL is required in CI")
const d = url ? describe : describe.skip

d("account methods (Postgres)", () => {
	let fetchFn: typeof fetch
	let close: () => Promise<void>
	beforeAll(async () => {
		const { createApp } = await import("../../../apps/api/src/app.ts")
		const { parseEnv } = await import("../../../apps/api/src/env.ts")
		const a = await createApp(
			parseEnv({
				STORE: "supabase",
				DATABASE_URL: url,
				EMBEDDER: "hash",
				RERANKER: "none",
				SIGNUP_MODE: "open",
			}),
		)
		fetchFn = ((u: string, i?: RequestInit) =>
			a.app.fetch(new Request(u, i))) as unknown as typeof fetch
		close = a.close
	})
	afterAll(() => close())

	test("signup → usage → keys lifecycle", async () => {
		const acct = await Smaran.signup("http://api", {
			name: "SDK Co",
			fetch: fetchFn,
		})
		const smaran = new Smaran({
			apiKey: acct.apiKey,
			baseUrl: "http://api",
			fetch: fetchFn,
		})
		expect((await smaran.usage()).plan).toBe("free")
		const extra = await smaran.createKey("ci")
		expect((await smaran.listKeys()).keys).toHaveLength(2)
		const err = (await new Smaran({
			apiKey: extra.apiKey,
			baseUrl: "http://api",
			fetch: fetchFn,
			maxRetries: 0,
		})
			.revokeKey(extra.keyId)
			.then(
				() => null,
				(e) => e,
			)) as SmaranError | null
		expect(err).toBeNull()
		const last = (await smaran
			.revokeKey(acct.keyId)
			.catch((e) => e)) as SmaranError
		expect(last.status).toBe(409)
		expect(last.code).toBe("conflict")
	})
})
