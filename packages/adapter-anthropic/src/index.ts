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

/** Anthropic Messages-API tool definition. Pass directly into `messages.create({ tools })`. */
export interface AnthropicTool {
	name: string
	description: string
	input_schema: {
		type: "object"
		properties: Record<
			string,
			{ type: MemoryToolParamType; description: string }
		>
		required: string[]
	}
}

export function memoryTools(): AnthropicTool[] {
	return memoryToolSpecs.map((spec) => ({
		name: spec.name,
		description: spec.description,
		input_schema: spec.parameters,
	}))
}

/** Whatever Anthropic returns as a `tool_use` content block. */
export interface AnthropicToolUseBlock {
	type: "tool_use"
	id: string
	name: string
	input: Record<string, unknown>
}

/**
 * Execute a memory tool call and return the `tool_result` content block
 * to send back in the next `messages.create` turn.
 */
export async function handleToolUse(
	client: MemoryClient,
	block: AnthropicToolUseBlock,
	scope: AdapterScope,
): Promise<{ type: "tool_result"; tool_use_id: string; content: string }> {
	const res = await handleMemoryToolCall(
		client,
		{ name: block.name, input: block.input },
		scope,
	)
	return { type: "tool_result", tool_use_id: block.id, content: res.content }
}

/** Type guard: narrows a content block to a memory tool_use block handleToolUse accepts. */
export function isMemoryToolUse<T extends { type: string }>(
	block: T,
): block is T & AnthropicToolUseBlock {
	const name = (block as { name?: string }).name
	return (
		block.type === "tool_use" &&
		(name === MEMORY_TOOL_NAMES.save || name === MEMORY_TOOL_NAMES.recall)
	)
}

/** Anthropic message shape used for context injection. */
/** Minimal Messages-API message shape; the SDK's MessageParam satisfies it. */
export interface AnthropicMessage {
	role: string
	content: string | ReadonlyArray<{ type: string }>
}

/**
 * Recall against the last user message and return an updated
 * `{ system, messages }` pair. Auto-injection pattern — the model
 * sees the recalled memories as system context without any tool call.
 */
export async function withRecalledContext<M extends AnthropicMessage>(
	client: MemoryClient,
	args: {
		system?: string
		messages: M[]
	},
	opts: AutoRecallOptions = {},
): Promise<{ system: string; messages: M[] }> {
	const last = [...args.messages].reverse().find((m) => m.role === "user")
	const lastText = last ? messageText(last) : ""
	const recalled = await buildRecalledContext(client, lastText, opts)
	const system = recalled
		? [args.system, recalled].filter(Boolean).join("\n\n")
		: (args.system ?? "")
	return { system, messages: args.messages }
}

function messageText(m: AnthropicMessage): string {
	if (typeof m.content === "string") return m.content
	return m.content
		.map((b) => b as { type: string; text?: unknown })
		.filter((b) => b.type === "text" && typeof b.text === "string")
		.map((b) => b.text as string)
		.join("\n")
}
