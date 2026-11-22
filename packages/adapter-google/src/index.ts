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

/**
 * Gemini function declaration (structurally `FunctionDeclaration` from
 * @google/genai). Uses `parametersJsonSchema`, which takes standard JSON
 * Schema — no hand-mapping to Gemini's OpenAPI-subset `Type` enum.
 */
export interface GoogleFunctionDeclaration {
	name: string
	description: string
	parametersJsonSchema: {
		type: "object"
		properties: Record<
			string,
			{ type: MemoryToolParamType; description: string }
		>
		required: string[]
	}
}

export function memoryFunctionDeclarations(): GoogleFunctionDeclaration[] {
	return memoryToolSpecs.map((spec) => ({
		name: spec.name,
		description: spec.description,
		parametersJsonSchema: spec.parameters,
	}))
}

/** The value to place in `config.tools` for `ai.models.generateContent`. */
export function memoryTools(): Array<{
	functionDeclarations: GoogleFunctionDeclaration[]
}> {
	return [{ functionDeclarations: memoryFunctionDeclarations() }]
}

/** A function call as returned by `response.functionCalls` (all fields optional in @google/genai). */
export interface GoogleFunctionCall {
	id?: string
	name?: string
	args?: Record<string, unknown>
}

/**
 * Execute a memory function call and return the `functionResponse` part
 * to send back in the next turn. Uses the `output` key, which the Gemini
 * API documents for function results.
 */
export async function handleFunctionCall(
	client: MemoryClient,
	call: GoogleFunctionCall,
	scope: AdapterScope,
): Promise<{
	functionResponse: { id?: string; name: string; response: { output: string } }
}> {
	const name = call.name ?? ""
	const res = await handleMemoryToolCall(
		client,
		{ name, input: call.args ?? {} },
		scope,
	)
	return {
		functionResponse: {
			...(call.id ? { id: call.id } : {}),
			name,
			response: { output: res.content },
		},
	}
}

export function isMemoryFunctionCall(call: { name?: string }): boolean {
	return (
		call.name === MEMORY_TOOL_NAMES.save ||
		call.name === MEMORY_TOOL_NAMES.recall
	)
}

/** Gemini `contents` entry shape used for context injection. */
export interface GoogleContent {
	role: "user" | "model"
	parts: Array<{ text?: string; [k: string]: unknown }>
}

/**
 * Recall against the last user message and return an updated
 * `{ systemInstruction, contents }` pair. Gemini takes a
 * `systemInstruction` string on the model config; the caller merges it.
 */
export async function withRecalledContext(
	client: MemoryClient,
	args: { systemInstruction?: string; contents: GoogleContent[] },
	opts: AutoRecallOptions = {},
): Promise<{ systemInstruction: string; contents: GoogleContent[] }> {
	const last = [...args.contents].reverse().find((c) => c.role === "user")
	const lastText = last ? contentText(last) : ""
	const recalled = await buildRecalledContext(client, lastText, opts)
	const systemInstruction = recalled
		? [args.systemInstruction, recalled].filter(Boolean).join("\n\n")
		: (args.systemInstruction ?? "")
	return { systemInstruction, contents: args.contents }
}

function contentText(c: GoogleContent): string {
	return c.parts
		.map((p) => (typeof p.text === "string" ? p.text : ""))
		.filter(Boolean)
		.join("\n")
}
