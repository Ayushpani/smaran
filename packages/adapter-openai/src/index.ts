import {
	type MemoryToolParamType,
	type AdapterScope,
	type AutoRecallOptions,
	buildRecalledContext,
	handleMemoryToolCall,
	MEMORY_TOOL_NAMES,
	type MemoryClient,
	memoryToolSpecs,
} from "@repo/core"

/** OpenAI Chat Completions / Responses tool definition. */
export interface OpenAITool {
	type: "function"
	function: {
		name: string
		description: string
		parameters: {
			type: "object"
			properties: Record<
				string,
				{ type: MemoryToolParamType; description: string }
			>
			required: string[]
		}
	}
}

export function memoryTools(): OpenAITool[] {
	return memoryToolSpecs.map((spec) => ({
		type: "function" as const,
		function: {
			name: spec.name,
			description: spec.description,
			parameters: spec.parameters,
		},
	}))
}

/** Whatever OpenAI returns in `message.tool_calls[i]`. */
export interface OpenAIToolCall {
	id: string
	type: "function"
	function: { name: string; arguments: string }
}

/**
 * Execute a memory tool call and return a `tool` message to append to
 * the next request. Also works with the Codex CLI and any
 * OpenAI-compatible provider (Groq, Together, DeepSeek, Ollama,
 * LM Studio) — the wire format is identical.
 */
export async function handleToolCall(
	client: MemoryClient,
	call: OpenAIToolCall,
	scope: AdapterScope,
): Promise<{ role: "tool"; tool_call_id: string; content: string }> {
	let input: Record<string, unknown> = {}
	try {
		input = call.function.arguments ? JSON.parse(call.function.arguments) : {}
	} catch {
		return {
			role: "tool",
			tool_call_id: call.id,
			content: "error: invalid tool arguments (not JSON)",
		}
	}
	const res = await handleMemoryToolCall(
		client,
		{ name: call.function.name, input },
		scope,
	)
	return { role: "tool", tool_call_id: call.id, content: res.content }
}

/** Type guard: narrows an SDK tool call to a memory function call handleToolCall accepts. */
export function isMemoryToolCall<T extends { type?: string }>(
	call: T,
): call is T & OpenAIToolCall {
	const fn = (call as { function?: { name?: string } }).function
	const name = fn?.name
	return (
		call.type === "function" &&
		(name === MEMORY_TOOL_NAMES.save || name === MEMORY_TOOL_NAMES.recall)
	)
}

/** Minimal Chat Completions message shape; the SDK's ChatCompletionMessageParam satisfies it. */
export interface OpenAIMessage {
	role: string
	content?: unknown
}

/**
 * Prepend / merge a system message containing recalled memories for
 * the last user turn. Idempotent: if no memories match, returns the
 * original messages unchanged.
 */
export async function withRecalledContext<M extends OpenAIMessage>(
	client: MemoryClient,
	messages: M[],
	opts: AutoRecallOptions = {},
): Promise<Array<M | { role: "system"; content: string }>> {
	const last = [...messages].reverse().find((m) => m.role === "user")
	const lastText = typeof last?.content === "string" ? last.content : ""
	const recalled = await buildRecalledContext(client, lastText, opts)
	if (!recalled) return messages

	const [head, ...rest] = messages
	if (head?.role === "system" && typeof head.content === "string") {
		return [
			{ role: "system", content: `${head.content}\n\n${recalled}` },
			...rest,
		]
	}
	return [{ role: "system", content: recalled }, ...messages]
}
