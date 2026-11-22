import { describe, expect, test } from "bun:test"
import {
	createCore,
	HashEmbedder,
	HeuristicConsolidator,
	InMemoryStore,
	type MemoryEvent,
} from "../src/index.ts"

function makeCore() {
	const store = new InMemoryStore()
	const core = createCore({
		store,
		embedder: new HashEmbedder(64),
		consolidator: new HeuristicConsolidator(),
	})
	return { core, store }
}

/** Collect whatever events arrive within one macrotask, then close. */
async function drain(it: AsyncIterator<MemoryEvent>, ms = 20) {
	const out: MemoryEvent[] = []
	const deadline = Date.now() + ms
	while (Date.now() < deadline) {
		const next = await Promise.race([
			it.next(),
			new Promise<null>((r) => setTimeout(() => r(null), ms)),
		])
		if (!next || next.done) break
		out.push(next.value)
	}
	await it.return?.()
	return out
}

describe("save / recall", () => {
	test("keeps a message whole and chunks only long text", async () => {
		const { core } = makeCore()
		const [one] = await core.save({
			tenantId: "x",
			text: "I live in Powai. My dog is Bruno.",
		})
		expect(one!.text).toBe("I live in Powai. My dog is Bruno.")
		const long = Array.from(
			{ length: 40 },
			(_, i) => `Fact number ${i} is here.`,
		).join(" ")
		const chunks = await core.save({ tenantId: "x", text: long })
		expect(chunks.length).toBeGreaterThan(1)
		expect(chunks.every((c) => c.text.length <= 500)).toBe(true)
		expect(chunks.map((c) => c.text).join(" ")).toBe(long)
	})

	test("recalls within tenant + user scope", async () => {
		const { core } = makeCore()
		await core.save({ tenantId: "t1", userId: "u1", text: "I live in Powai." })
		await core.save({
			tenantId: "t1",
			userId: "u1",
			text: "My dog is called Bruno.",
		})
		const hits = await core.recall({
			tenantId: "t1",
			userId: "u1",
			query: "Bruno dog",
		})
		expect(hits.hits.some((h) => h.memory.text.includes("Bruno"))).toBe(true)

		const otherTenant = await core.recall({
			tenantId: "t2",
			query: "Bruno dog",
		})
		expect(otherTenant.hits).toHaveLength(0)
		const otherUser = await core.recall({
			tenantId: "t1",
			userId: "u2",
			query: "Bruno dog",
		})
		expect(otherUser.hits).toHaveLength(0)
	})

	test("restating a fact corroborates it instead of duplicating", async () => {
		const { core, store } = makeCore()
		const [first] = await core.save({
			tenantId: "t",
			userId: "u",
			text: "I prefer tea.",
		})
		const [again] = await core.save({
			tenantId: "t",
			userId: "u",
			text: "i prefer tea",
		})
		expect(again!.id).toBe(first!.id)
		expect(again!.confidenceAlpha).toBe(2)
		expect(store.size()).toBe(1)
	})

	test("a changed value in the same frame replaces the old memory", async () => {
		const { core } = makeCore()
		const [old] = await core.save({
			tenantId: "t",
			userId: "u",
			text: "My room number is 13.",
		})
		const [next] = await core.save({
			tenantId: "t",
			userId: "u",
			text: "My room number is 913.",
		})
		expect(next!.supersedesId).toBe(old!.id)
		const { hits } = await core.recall({
			tenantId: "t",
			userId: "u",
			query: "room number",
		})
		expect(hits.map((h) => h.memory.text)).toEqual(["My room number is 913."])
	})

	test("a related but different fact never hides the old one", async () => {
		const { core } = makeCore()
		await core.save({
			tenantId: "t",
			userId: "u",
			text: "I am allergic to peanuts.",
		})
		const [next] = await core.save({
			tenantId: "t",
			userId: "u",
			text: "I am allergic to penicillin.",
		})
		expect(next!.supersedesId).not.toBeNull()
		const { hits } = await core.recall({
			tenantId: "t",
			userId: "u",
			query: "allergic",
		})
		const texts = hits.map((h) => h.memory.text)
		expect(texts).toContain("I am allergic to peanuts.")
		expect(texts).toContain("I am allergic to penicillin.")
		const old = hits.find((h) => h.memory.text.includes("peanuts"))!
		expect(old.memory.confidenceBeta).toBe(2)
	})

	test("revision never crosses users, including the null user", async () => {
		const { core } = makeCore()
		await core.save({
			tenantId: "t",
			userId: "alice",
			text: "My room number is 13.",
		})
		const [mine] = await core.save({
			tenantId: "t",
			text: "My room number is 913.",
		})
		expect(mine!.supersedesId).toBeNull()
		const { hits } = await core.recall({
			tenantId: "t",
			userId: "alice",
			query: "room number",
		})
		expect(hits.map((h) => h.memory.text)).toEqual(["My room number is 13."])
	})

	test("explicit revises closes the old fact; asOf still sees it", async () => {
		const { core } = makeCore()
		const [old] = await core.save({ tenantId: "t", text: "My room is 13." })
		const before = new Date().toISOString()
		await Bun.sleep(5)
		await core.save({
			tenantId: "t",
			text: "My room is 913.",
			revises: old!.id,
		})
		const now = await core.recall({ tenantId: "t", query: "room" })
		expect(now.hits.map((h) => h.memory.text)).toEqual(["My room is 913."])
		const past = await core.recall({
			tenantId: "t",
			query: "room",
			asOf: before,
		})
		expect(past.hits.map((h) => h.memory.text)).toEqual(["My room is 13."])
	})

	test("forget only deletes within the caller's tenant", async () => {
		const { core, store } = makeCore()
		const [m] = await core.save({ tenantId: "t1", text: "Secret fact here." })
		await core.forget("t2", m!.id)
		expect(store.size()).toBe(1)
		await core.forget("t1", m!.id)
		expect(store.size()).toBe(0)
	})
})

describe("session events", () => {
	test("subscribers never see another tenant's session with the same id", async () => {
		const { core } = makeCore()
		const mine = core.subscribe("t1", "s")[Symbol.asyncIterator]()
		const theirs = core.subscribe("t2", "s")[Symbol.asyncIterator]()
		await core.save({
			tenantId: "t2",
			sessionId: "s",
			text: "Tenant two private fact.",
		})
		expect(await drain(mine)).toHaveLength(0)
		const got = await drain(theirs)
		expect(got.map((e) => e.type)).toEqual(["memory.saved"])
	})

	test("forget is delivered to the session that owned the memory", async () => {
		const { core } = makeCore()
		const [m] = await core.save({
			tenantId: "t",
			sessionId: "s",
			text: "Temporary fact.",
		})
		const it = core.subscribe("t", "s")[Symbol.asyncIterator]()
		await core.forget("t", m!.id)
		expect(await drain(it)).toEqual([{ type: "memory.forgotten", id: m!.id }])
	})

	test("return() wakes a parked consumer so the stream can end", async () => {
		const { core } = makeCore()
		const it = core.subscribe("t", "s")[Symbol.asyncIterator]()
		const pending = it.next()
		await it.return?.()
		expect((await pending).done).toBe(true)
	})
})
