import {
	type AdapterScope,
	buildRecalledContext,
	handleMemoryToolCall,
	type MemoryClient,
	memoryToolSpecs,
} from "@repo/core"

import { jsonSchema, type Tool, tool } from "ai"

/**
 * Vercel AI SDK integration (AI SDK 5+; tested against 7). Two entry points:
 *   memoryTools(memory, scope) — a tools object for `generateText` /
 *                                 `streamText` / agents, built with the
 *                                 SDK's own `tool()` + `jsonSchema()`.
 *   withRecalledContext(memory, messages, opts) — silent injection.
 */
export function memoryTools(
	client: MemoryClient,
	scope: AdapterScope,
): Record<string, Tool<Record<string, unknown>, string>> {
	const out: Record<string, Tool<Record<string, unknown>, string>> = {}
	for (const spec of memoryToolSpecs) {
		out[spec.name] = tool({
			description: spec.description,
			inputSchema: jsonSchema<Record<string, unknown>>(spec.parameters),
			execute: async (input) => {
				const res = await handleMemoryToolCall(
					client,
					{ name: spec.name, input },
					scope,
				)
				return res.content
			},
		})
	}
	return out
}

export interface VercelMessage {
	role: "system" | "user" | "assistant" | "tool"
	content: string | Array<{ type: string; text?: string; [k: string]: unknown }>
	[k: string]: unknown
}

export async function withRecalledContext(
	client: MemoryClient,
	messages: VercelMessage[],
	opts: AdapterScope & { topK?: number } = {},
): Promise<VercelMessage[]> {
	const last = [...messages].reverse().find((m) => m.role === "user")
	const lastText = last ? messageText(last) : ""
	const recalled = await buildRecalledContext(client, lastText, opts)
	if (!recalled) return messages

	const [head, ...rest] = messages
	if (head?.role === "system" && typeof head.content === "string") {
		return [{ ...head, content: `${head.content}\n\n${recalled}` }, ...rest]
	}
	return [{ role: "system", content: recalled }, ...messages]
}

function messageText(m: VercelMessage): string {
	if (typeof m.content === "string") return m.content
	return m.content
		.filter((b) => b.type === "text" && typeof b.text === "string")
		.map((b) => b.text as string)
		.join("\n")
}
