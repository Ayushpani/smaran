/**
 * Postgres integration tests — run the real store through the real core.
 * Needs a migrated database: DATABASE_URL=… bun test test
 * Skipped when DATABASE_URL is unset (CI provides a pgvector service).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createCore, HashEmbedder, HeuristicConsolidator } from "@repo/core"
import postgres from "postgres"
import { createDb, createSupabaseStore } from "../src/index.ts"

const url = process.env.DATABASE_URL
// In CI a missing database must fail loudly, never silently skip.
if (process.env.CI && !url) throw new Error("DATABASE_URL is required in CI")
const d = url ? describe : describe.skip

d("postgres store", () => {
	const sql = postgres(url ?? "postgres://unused", { max: 1 })
	const db = createDb({ url: url ?? "postgres://unused", max: 2 })
	const store = createSupabaseStore(db)
	const core = createCore({
		store,
		embedder: new HashEmbedder(),
		consolidator: new HeuristicConsolidator(),
	})
	const run = Math.random().toString(36).slice(2, 8)
	const T1 = `ten_test_${run}_a`
	const T2 = `ten_test_${run}_b`

	beforeAll(async () => {
		await sql`INSERT INTO tenants (id, name) VALUES (${T1}, 'a'), (${T2}, 'b')`
	})
	afterAll(async () => {
		await sql`DELETE FROM tenants WHERE id IN (${T1}, ${T2})`
		await sql.end()
	})

	test("keyword search matches any query word, weighted by rarity", async () => {
		const u = "kw"
		await core.save({
			tenantId: T1,
			userId: u,
			text: "Caroline went to a pottery class.",
		})
		await core.save({
			tenantId: T1,
			userId: u,
			text: "Caroline likes running.",
		})
		await core.save({ tenantId: T1, userId: u, text: "Caroline has a dog." })
		const rows = await store.searchKeyword({
			tenantId: T1,
			userId: u,
			sessionId: null,
			queryText: "when did Caroline attend pottery",
			topK: 5,
			includeCrossSession: true,
		})
		// Not every query word is present, yet it matches; the rare word wins.
		expect(rows[0]?.memory.text).toBe("Caroline went to a pottery class.")
		expect(rows.length).toBe(3)
	})

	test("dense search returns a small user's memories in a larger table", async () => {
		for (let i = 0; i < 60; i++) {
			await core.save({
				tenantId: T1,
				userId: `bulk${i % 6}`,
				text: `Bulk filler fact ${i}.`,
			})
		}
		await core.save({ tenantId: T1, userId: "small", text: "I keep bees." })
		const { hits } = await core.recall({
			tenantId: T1,
			userId: "small",
			query: "anything",
		})
		expect(hits.map((h) => h.memory.text)).toEqual(["I keep bees."])
	})

	test("tenants are isolated in save, recall and forget", async () => {
		const [m] = await core.save({
			tenantId: T1,
			userId: "iso",
			text: "Tenant one secret.",
		})
		const other = await core.recall({
			tenantId: T2,
			userId: "iso",
			query: "secret",
		})
		expect(other.hits).toHaveLength(0)
		await core.forget(T2, m!.id)
		const still = await core.recall({
			tenantId: T1,
			userId: "iso",
			query: "secret",
		})
		expect(still.hits).toHaveLength(1)
	})

	test("revision rules hold in Postgres", async () => {
		const u = "rev"
		const [a] = await core.save({
			tenantId: T1,
			userId: u,
			text: "My room number is 13.",
		})
		const [b] = await core.save({
			tenantId: T1,
			userId: u,
			text: "My room number is 913.",
		})
		expect(b!.supersedesId).toBe(a!.id)
		const [dup] = await core.save({
			tenantId: T1,
			userId: u,
			text: "my room number is 913",
		})
		expect(dup!.id).toBe(b!.id)
		const { hits } = await core.recall({
			tenantId: T1,
			userId: u,
			query: "room number",
		})
		expect(hits.map((h) => h.memory.text)).toEqual(["My room number is 913."])
		expect(hits[0]!.memory.confidenceAlpha).toBe(2)
	})
})
