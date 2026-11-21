import { expect, test } from "bun:test"
import { Agent } from "@mastra/core/agent"
import type { MemoryClient } from "@repo/core"
import { MockLanguageModelV3 } from "ai/test"
import { memoryTools } from "../src/index.ts"

const memory: MemoryClient = {
	async save() {
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
const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
}

test("a Mastra Agent calls memory_recall and answers from it", async () => {
	const model = new MockLanguageModelV3({
		doGenerate: [
			{
				content: [
					{
						type: "tool-call",
						toolCallId: "c1",
						toolName: "memory_recall",
						input: JSON.stringify({ query: "home" }),
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
	// Mastra bundles its own copy of the AI SDK provider types; the mock is
	// runtime-compatible but nominally different, hence the cast.
	const agent = new Agent({
		id: "a",
		name: "assistant",
		instructions: "Use memory.",
		model: model as never,
		tools: memoryTools(memory, { userId: "u" }),
	})
	const res = await agent.generate("where do I live?", { maxSteps: 3 })
	expect(res.text).toBe("You live in Powai.")
	const results = res.steps
		.flatMap((s: any) => s.toolResults ?? [])
		.map((r: any) => r.payload?.result ?? r.output ?? r.result)
	expect(results).toContain('<memory kind="fact">I live in Powai.</memory>')
}, 60_000)
