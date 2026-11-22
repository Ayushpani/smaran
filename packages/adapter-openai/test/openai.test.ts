import { expect, test } from "bun:test"
import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import type { MemoryClient } from "@repo/core"
import {
	handleToolCall,
	isMemoryToolCall,
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

test("openai SDK: tools, tool-call round trip, injected system message", async () => {
	const bodies: any[] = []
	const fetchFn = (async (_url: string, init: RequestInit) => {
		bodies.push(JSON.parse(String(init.body)))
		const first = bodies.length === 1
		return Response.json(
			{
				id: "c",
				object: "chat.completion",
				created: 0,
				model: "gpt-4o-mini",
				choices: [
					{
						index: 0,
						finish_reason: first ? "tool_calls" : "stop",
						logprobs: null,
						message: first
							? {
									role: "assistant",
									content: null,
									refusal: null,
									tool_calls: [
										{
											id: "t1",
											type: "function",
											function: {
												name: "memory_recall",
												arguments: '{"query":"home"}',
											},
										},
									],
								}
							: {
									role: "assistant",
									content: "You live in Powai.",
									refusal: null,
								},
					},
				],
			},
			{ headers: { "content-type": "application/json" } },
		)
	}) as unknown as typeof fetch
	const openai = new OpenAI({ apiKey: "test", fetch: fetchFn, maxRetries: 0 })

	const history: ChatCompletionMessageParam[] = [
		{ role: "user", content: "where do I live" },
	]
	const messages = await withRecalledContext(memory, history, { userId: "u" })
	const first = await openai.chat.completions.create({
		model: "gpt-4o-mini",
		messages,
		tools: memoryTools(),
	})
	expect(bodies[0].tools.map((t: any) => t.function.name).sort()).toEqual([
		"memory_recall",
		"memory_save",
	])
	expect(bodies[0].messages[0].role).toBe("system")

	const msg = first.choices[0]!.message
	const calls = (msg.tool_calls ?? []).filter(isMemoryToolCall)
	const toolMsgs = await Promise.all(
		calls.map((c) => handleToolCall(memory, c, { userId: "u" })),
	)
	const second = await openai.chat.completions.create({
		model: "gpt-4o-mini",
		messages: [...messages, msg, ...toolMsgs],
		tools: memoryTools(),
	})
	expect(second.choices[0]!.message.content).toBe("You live in Powai.")
	expect(bodies[1].messages.at(-1)).toEqual({
		role: "tool",
		tool_call_id: "t1",
		content: '<memory kind="fact">I live in Powai.</memory>',
	})
})
