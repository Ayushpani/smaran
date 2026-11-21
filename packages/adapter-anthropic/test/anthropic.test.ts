import { expect, test } from "bun:test"
import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages"
import type { MemoryClient } from "@repo/core"
import {
	handleToolUse,
	isMemoryToolUse,
	memoryTools,
	withRecalledContext,
} from "../src/index.ts"

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

test("anthropic SDK: tools, tool_use round trip, injected system prompt", async () => {
	const bodies: any[] = []
	const fetchFn = (async (_url: string, init: RequestInit) => {
		bodies.push(JSON.parse(String(init.body)))
		const first = bodies.length === 1
		return Response.json(
			{
				id: "msg",
				type: "message",
				role: "assistant",
				model: "claude-sonnet-4-5",
				stop_reason: first ? "tool_use" : "end_turn",
				stop_sequence: null,
				usage: { input_tokens: 1, output_tokens: 1 },
				content: first
					? [
							{
								type: "tool_use",
								id: "tu1",
								name: "memory_recall",
								input: { query: "home" },
							},
						]
					: [{ type: "text", text: "You live in Powai.", citations: null }],
			},
			{ headers: { "content-type": "application/json" } },
		)
	}) as unknown as typeof fetch
	const anthropic = new Anthropic({
		apiKey: "test",
		fetch: fetchFn,
		maxRetries: 0,
	})

	const history: MessageParam[] = [{ role: "user", content: "where do I live" }]
	const { system, messages } = await withRecalledContext(
		memory,
		{ system: "Be brief.", messages: history },
		{ userId: "u" },
	)
	const first = await anthropic.messages.create({
		model: "claude-sonnet-4-5",
		max_tokens: 100,
		system,
		messages,
		tools: memoryTools(),
	})
	expect(bodies[0].tools.map((t: any) => t.name).sort()).toEqual([
		"memory_recall",
		"memory_save",
	])
	expect(bodies[0].system).toContain("I live in Powai.")

	const results = await Promise.all(
		first.content
			.filter(isMemoryToolUse)
			.map((b) => handleToolUse(memory, b, { userId: "u" })),
	)
	const second = await anthropic.messages.create({
		model: "claude-sonnet-4-5",
		max_tokens: 100,
		tools: memoryTools(),
		messages: [
			...messages,
			{ role: "assistant", content: first.content },
			{ role: "user", content: results },
		],
	})
	expect((second.content[0] as { text: string }).text).toBe(
		"You live in Powai.",
	)
	expect(bodies[1].messages.at(-1).content[0]).toEqual({
		type: "tool_result",
		tool_use_id: "tu1",
		content: '<memory kind="fact">I live in Powai.</memory>',
	})
})
