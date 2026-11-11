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
	test("splits sentences and recalls within tenant + user scope", async () => {
		const { core } = makeCore()
		const saved = await core.save({
			tenantId: "t1",
			userId: "u1",
			text: "I live in Powai. My dog is called Bruno.",
		})
		expect(saved.map((m) => m.text)).toEqual([
			"I live in Powai.",
			"My dog is called Bruno.",
		])
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

	test("an identical restatement supersedes the prior memory", async () => {
		const { core } = makeCore()
		const [first] = await core.save({
			tenantId: "t",
			userId: "u",
			text: "I prefer tea.",
		})
		const [second] = await core.save({
			tenantId: "t",
			userId: "u",
			text: "I prefer tea.",
		})
		expect(second!.supersedesId).toBe(first!.id)
		const { hits } = await core.recall({
			tenantId: "t",
			userId: "u",
			query: "tea",
		})
		expect(hits.map((h) => h.memory.id)).toEqual([second!.id])
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
