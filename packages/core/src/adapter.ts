/**
 * Shared adapter primitives. Provider packages (adapter-anthropic,
 * adapter-openai, adapter-google, …) build on top of these and do
 * *only* the translation into the provider's native tool + message
 * shapes. No client wrapping, no monkey-patching — the caller keeps
 * their own SDK usage pattern.
 */

export interface MemoryClient {
	save(opts: {
		text: string
		userId?: string
		sessionId?: string
		source?: "text" | "voice"
		metadata?: Record<string, unknown>
	}): Promise<unknown>
	recall(opts: {
		query: string
		userId?: string
		sessionId?: string
		topK?: number
		includeCrossSession?: boolean
	}): Promise<{
		hits: Array<{
			memory: { id: string; text: string; kind: string }
			score: number
		}>
	}>
	/** Optional — voice adapters need this for barge-in rollback. */
	forget?(id: string): Promise<void>
}

export interface AdapterScope {
	userId?: string
	sessionId?: string
}

export interface AutoRecallOptions extends AdapterScope {
	topK?: number
	includeCrossSession?: boolean
}

export const MEMORY_TOOL_NAMES = {
	save: "memory_save",
	recall: "memory_recall",
} as const

/** JSON Schema primitive types the memory tools use. */
export type MemoryToolParamType = "string" | "number" | "integer" | "boolean"

export interface MemoryToolSpec {
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

export const memoryToolSpecs: MemoryToolSpec[] = [
	{
		name: MEMORY_TOOL_NAMES.save,
		description:
			"Persist a fact, preference, event, or entity the user has revealed, so it can be recalled in future turns and future sessions. Save concise, self-contained statements — not the whole message.",
		parameters: {
			type: "object",
			properties: {
				text: {
					type: "string",
					description: "The self-contained fact to remember.",
				},
			},
			required: ["text"],
		},
	},
	{
		name: MEMORY_TOOL_NAMES.recall,
		description:
			"Search prior memories for anything relevant to the current turn. Use liberally — recall is cheap and helps avoid asking the user for information they already provided.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "A short query capturing what to recall.",
				},
				topK: {
					type: "number",
					description: "Max number of hits to return. Defaults to 5.",
				},
			},
			required: ["query"],
		},
	},
]

export interface HandleToolResult {
	name: string
	content: string
}

/**
 * Provider-agnostic tool-call executor. Every adapter normalizes its
 * SDK's tool-use block into {name, input} and calls this.
 */
export async function handleMemoryToolCall(
	client: MemoryClient,
	call: { name: string; input: Record<string, unknown> },
	scope: AdapterScope,
): Promise<HandleToolResult> {
	if (call.name === MEMORY_TOOL_NAMES.save) {
		const text = String(call.input.text ?? "").trim()
		if (!text) return { name: call.name, content: "error: empty text" }
		await client.save({ text, ...scope })
		return { name: call.name, content: "saved" }
	}
	if (call.name === MEMORY_TOOL_NAMES.recall) {
		const query = String(call.input.query ?? "").trim()
		const topK = Number(call.input.topK ?? 5)
		if (!query) return { name: call.name, content: "error: empty query" }
		const res = await client.recall({ query, topK, ...scope })
		if (res.hits.length === 0) return { name: call.name, content: "" }
		const body = res.hits
			.map((h) => `<memory kind="${h.memory.kind}">${h.memory.text}</memory>`)
			.join("\n")
		return { name: call.name, content: body }
	}
	return { name: call.name, content: `error: unknown tool ${call.name}` }
}

/**
 * Runs a recall against the last user message and formats the hits as
 * a system-prompt fragment. Adapters call this before dispatching to
 * the model. Empty recall → empty string, safe to concatenate.
 */
export async function buildRecalledContext(
	client: MemoryClient,
	lastUserText: string,
	opts: AutoRecallOptions = {},
): Promise<string> {
	const query = lastUserText.trim()
	if (!query) return ""
	const res = await client.recall({
		query,
		topK: opts.topK ?? 5,
		userId: opts.userId,
		sessionId: opts.sessionId,
		includeCrossSession: opts.includeCrossSession ?? true,
	})
	if (res.hits.length === 0) return ""
	// Structural delimiter format, not natural-language framing prose —
	// prior versions injected English instruction sentences ("Relevant
	// memories from prior turns...", "Use these silently...") into every
	// adapter's prompt regardless of the tenant's locale. An XML-like tag
	// is language-neutral and every major model already treats tagged
	// blocks as structured context rather than user-facing text.
	const lines = res.hits.map(
		(h) => `<memory kind="${h.memory.kind}">${h.memory.text}</memory>`,
	)
	return ["<recalled-memories>", ...lines, "</recalled-memories>"].join("\n")
}
