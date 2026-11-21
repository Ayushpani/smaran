import { afterEach, expect, test } from "bun:test"
import { GoogleGenAI } from "@google/genai"
import type { MemoryClient } from "@repo/core"
import {
	handleFunctionCall,
	isMemoryFunctionCall,
	memoryTools,
	withRecalledContext,
} from "../src/index.ts"

const realFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = realFetch
})

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

test("@google/genai: declarations, function call round trip, systemInstruction", async () => {
	const bodies: any[] = []
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		bodies.push(JSON.parse(String(init.body)))
		const first = bodies.length === 1
		return Response.json({
			candidates: [
				{
					content: {
						role: "model",
						parts: first
							? [
									{
										functionCall: {
											id: "fc1",
											name: "memory_recall",
											args: { query: "home" },
										},
									},
								]
							: [{ text: "You live in Powai." }],
					},
					finishReason: "STOP",
				},
			],
		})
	}) as typeof fetch

	const ai = new GoogleGenAI({ apiKey: "test" })
	const history = [
		{ role: "user" as const, parts: [{ text: "where do I live" }] },
	]
	const { systemInstruction, contents } = await withRecalledContext(
		memory,
		{ contents: history },
		{ userId: "u" },
	)
	const first = await ai.models.generateContent({
		model: "gemini-2.5-flash",
		contents,
		config: { systemInstruction, tools: memoryTools() },
	})
	// What the SDK actually sent: JSON-schema declarations + injected memories.
	const decl = bodies[0].tools[0].functionDeclarations
	expect(decl.map((d: any) => d.name).sort()).toEqual([
		"memory_recall",
		"memory_save",
	])
	expect(decl[0].parametersJsonSchema.type).toBe("object")
	expect(JSON.stringify(bodies[0].systemInstruction)).toContain(
		"I live in Powai.",
	)

	const calls = (first.functionCalls ?? []).filter(isMemoryFunctionCall)
	const parts = await Promise.all(
		calls.map((c) => handleFunctionCall(memory, c, { userId: "u" })),
	)
	expect(parts[0]!.functionResponse).toEqual({
		id: "fc1",
		name: "memory_recall",
		response: { output: '<memory kind="fact">I live in Powai.</memory>' },
	})
	const second = await ai.models.generateContent({
		model: "gemini-2.5-flash",
		contents: [
			...contents,
			first.candidates![0]!.content!,
			{ role: "user", parts },
		],
		config: { tools: memoryTools() },
	})
	expect(second.text).toBe("You live in Powai.")
	expect(bodies[1].contents.at(-1).parts[0].functionResponse.name).toBe(
		"memory_recall",
	)
})
