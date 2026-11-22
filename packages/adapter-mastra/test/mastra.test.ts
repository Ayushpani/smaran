import { expect, test } from "bun:test"
import type { MemoryClient } from "@repo/core"
import { memoryTools } from "../src/index.ts"

const saved: unknown[] = []
const memory: MemoryClient = {
	async save(o) {
		saved.push(o)
		return []
	},
	async recall(o) {
		return {
			hits: o.query
				? [
						{
							memory: { id: "m", text: "I live in Powai.", kind: "fact" },
							score: 1,
						},
					]
				: [],
		}
	},
}

test("Mastra tools validate input and execute", async () => {
	const tools = memoryTools(memory, { userId: "u" })
	expect(tools.memory_save.id).toBe("memory_save")
	const ctx = {} as never
	expect(
		await tools.memory_save.execute!({ text: "Prefers aisle seats" }, ctx),
	).toBe("saved")
	expect(saved).toEqual([{ text: "Prefers aisle seats", userId: "u" }])
	expect(await tools.memory_recall.execute!({ query: "home" }, ctx)).toBe(
		'<memory kind="fact">I live in Powai.</memory>',
	)
})
