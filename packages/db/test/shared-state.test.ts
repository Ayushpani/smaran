/** Multi-instance behaviour: each "instance" gets its own connections. */
import { afterAll, describe, expect, test } from "bun:test"
import type { MemoryEvent } from "@repo/core"
import {
	createDb,
	createPgEventBus,
	createPgIngestBuffers,
	createPgRateLimitStore,
} from "../src/index.ts"

const url = process.env.DATABASE_URL
if (process.env.CI && !url) throw new Error("DATABASE_URL is required in CI")
const d = url ? describe : describe.skip

d("shared state across instances", () => {
	const run = Math.random().toString(36).slice(2, 8)
	const busA = createPgEventBus(url ?? "postgres://unused")
	const busB = createPgEventBus(url ?? "postgres://unused")
	const dbA = createDb({ url: url ?? "postgres://unused", max: 2 })
	const dbB = createDb({ url: url ?? "postgres://unused", max: 2 })
	afterAll(async () => {
		await Promise.all([busA.close(), busB.close()])
	})

	test("an event published on instance A reaches a subscriber on instance B, tenant-scoped", async () => {
		await Promise.all([busA.ready, busB.ready])
		const mine = busB.subscribe(`t_${run}`, "s")[Symbol.asyncIterator]()
		const other = busB.subscribe(`t_other_${run}`, "s")[Symbol.asyncIterator]()
		const event: MemoryEvent = { type: "memory.forgotten", id: "mem_1" }
		await busA.publish(`t_${run}`, "s", event)
		const got = await Promise.race([
			mine.next(),
			Bun.sleep(2000).then(() => null),
		])
		expect(got?.value).toEqual(event)
		const leaked = await Promise.race([
			other.next(),
			Bun.sleep(300).then(() => null),
		])
		expect(leaked).toBeNull()
		await mine.return?.()
		await other.return?.()
	})

	test("oversized events are slimmed to fit NOTIFY", async () => {
		const it = busB.subscribe(`t_${run}`, "big")[Symbol.asyncIterator]()
		const memory = {
			id: "m",
			text: "x".repeat(20_000),
			metadata: { originalText: "y".repeat(20_000) },
		}
		await busA.publish(`t_${run}`, "big", {
			type: "memory.saved",
			memory,
		} as never)
		const got = (await Promise.race([
			it.next(),
			Bun.sleep(2000).then(() => null),
		])) as { value: any } | null
		expect(got?.value.memory.id).toBe("m")
		expect(got?.value.memory.metadata).toEqual({ truncated: true })
		await it.return?.()
	})

	test("voice buffers merge identically whichever instance receives the partial", async () => {
		const a = createPgIngestBuffers(dbA)
		const b = createPgIngestBuffers(dbB)
		const t = `t_${run}`
		await a.append(t, "call", "my room")
		await b.append(t, "call", "my room number")
		await a.append(t, "call", "number") // already at the end → ignored
		await b.append(t, "call", "is 913")
		expect((await a.stats(t)).sessions).toBe(1)
		expect(await b.take(t, "call")).toBe("my room number is 913")
		expect(await a.take(t, "call")).toBe("")
	})

	test("the rate limit is shared across instances", async () => {
		const a = createPgRateLimitStore(dbA)
		const b = createPgRateLimitStore(dbB)
		const key = `Bearer k_${run}`
		const results = []
		for (let i = 0; i < 6; i++)
			results.push((await (i % 2 ? a : b).hit(key, 4)).allowed)
		expect(results).toEqual([true, true, true, true, false, false])
		const denied = await a.hit(key, 4)
		expect(denied.retryAfter).toBeGreaterThan(0)
		expect(denied.remaining).toBe(0)
	})
})
