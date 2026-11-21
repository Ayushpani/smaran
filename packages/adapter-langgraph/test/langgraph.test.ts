import { expect, test } from "bun:test"
import {
	AIMessage,
	HumanMessage,
	SystemMessage,
	type ToolMessage,
} from "@langchain/core/messages"
import { ToolNode } from "@langchain/langgraph/prebuilt"
import type { MemoryClient } from "@repo/core"
import { memoryTools, withRecalledContext } from "../src/index.ts"

const saved: unknown[] = []
const memory: MemoryClient = {
	async save(o) {
		saved.push(o)
		return []
	},
	async recall() {
		return {
			hits: [
				{
					memory: { id: "m", text: "I live in Powai.", kind: "fact" },
					score: 1,
				},
			],
		}
	},
}

test("LangGraph ToolNode executes memory tools from a model's tool calls", async () => {
	const node = new ToolNode(memoryTools(memory, { userId: "u" }))
	const ai = new AIMessage({
		content: "",
		tool_calls: [
			{
				id: "1",
				name: "memory_save",
				args: { text: "Prefers aisle seats" },
				type: "tool_call",
			},
			{
				id: "2",
				name: "memory_recall",
				args: { query: "home" },
				type: "tool_call",
			},
		],
	})
	const out = (await node.invoke({
		messages: [new HumanMessage("hi"), ai],
	})) as { messages: ToolMessage[] }
	// The node returns ONLY the new tool messages; LangGraph's reducer appends them.
	expect(out.messages.map((m) => [m.tool_call_id, m.content])).toEqual([
		["1", "saved"],
		["2", '<memory kind="fact">I live in Powai.</memory>'],
	])
	expect(saved).toEqual([{ text: "Prefers aisle seats", userId: "u" }])
})

test("tools expose JSON-schema parameters to bindTools", () => {
	const [save] = memoryTools(memory, {})
	expect(save!.name).toBe("memory_save")
	expect(JSON.stringify(save!.schema)).toContain('"required":["text"]')
})

test("withRecalledContext prepends or merges a SystemMessage", async () => {
	const a = await withRecalledContext(
		memory,
		[new HumanMessage("where do I live")],
		{ userId: "u" },
	)
	expect(a[0]).toBeInstanceOf(SystemMessage)
	const b = await withRecalledContext(memory, [
		new SystemMessage("Be brief."),
		new HumanMessage("where?"),
	])
	expect(b).toHaveLength(2)
	expect(b[0]!.text).toContain("Be brief.")
	expect(b[0]!.text).toContain("I live in Powai.")
})
