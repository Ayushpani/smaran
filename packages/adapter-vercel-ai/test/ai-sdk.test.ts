import { describe, expect, test } from "bun:test"
import type { MemoryClient } from "@repo/core"
import { generateText, stepCountIs } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { memoryTools, withRecalledContext } from "../src/index.ts"

function fakeMemory() {
	const saved: Array<{ text: string; userId?: string }> = []
	const client: MemoryClient = {
		async save(o) {
			saved.push(o)
			return [{ id: "m1" }]
		},
		async recall(o) {
			return {
				hits: o.query.includes("live")
					? [
							{
								memory: { id: "m0", text: "I live in Powai.", kind: "fact" },
								score: 1,
							},
						]
					: [],
			}
		},
	}
	return { client, saved }
}

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
}

describe("Vercel AI SDK 7", () => {
	test("generateText executes memory tools in a real tool-call loop", async () => {
		const { client, saved } = fakeMemory()
		const model = new MockLanguageModelV4({
			doGenerate: [
				{
					content: [
						{
							type: "tool-call",
							toolCallId: "c1",
							toolName: "memory_save",
							input: JSON.stringify({ text: "Prefers aisle seats" }),
						},
						{
							type: "tool-call",
							toolCallId: "c2",
							toolName: "memory_recall",
							input: JSON.stringify({ query: "where do I live" }),
						},
					],
					finishReason: { unified: "tool-calls", raw: "tool_calls" },
					usage,
					warnings: [],
				},
				{
					content: [{ type: "text", text: "You live in Powai." }],
					finishReason: { unified: "stop", raw: "stop" },
					usage,
					warnings: [],
				},
			] as never,
		})
		const res = await generateText({
			model,
			prompt: "remember I prefer aisle seats; where do I live?",
			tools: memoryTools(client, { userId: "u1" }),
			stopWhen: stepCountIs(3),
		})
		expect(res.text).toBe("You live in Powai.")
		expect(saved).toEqual([{ text: "Prefers aisle seats", userId: "u1" }])
		const results = res.steps[0]!.toolResults.map((r) => r.output)
		expect(results).toEqual([
			"saved",
			'<memory kind="fact">I live in Powai.</memory>',
		])
		// The model received both tools with real JSON-schema parameters.
		const sent = model.doGenerateCalls[0]!.tools!.map((t) => t.name).sort()
		expect(sent).toEqual(["memory_recall", "memory_save"])
	})

	test("withRecalledContext injects memories as a system message", async () => {
		const { client } = fakeMemory()
		const msgs = await withRecalledContext(
			client,
			[{ role: "user", content: "where do I live" }],
			{ userId: "u1" },
		)
		expect(msgs[0]!.role).toBe("system")
		expect(String(msgs[0]!.content)).toContain("I live in Powai.")
	})
})
