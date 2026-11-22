import {
	type MemoryToolParamType,
	type AdapterScope,
	buildRecalledContext,
	handleMemoryToolCall,
	MEMORY_TOOL_NAMES,
	type MemoryClient,
	memoryToolSpecs,
} from "@repo/core"
import { StreamingSession } from "@repo/voice"

/**
 * Adapter for LiveKit Agents' voice pipeline. LiveKit sessions carry
 * a `conversation_item_added` stream with user/assistant text; ASR
 * partials arrive via a separate `on_user_transcript_updated` hook.
 * The adapter is transport-agnostic — provide the transcript events,
 * get memory writes and cached recalls back.
 */

export interface LiveKitVoiceAdapterOptions {
	memory: MemoryClient
	sessionId: string
	userId?: string
	onError?: (err: unknown) => void
}

export interface LiveKitFunctionTool {
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

/** Tool descriptors for LiveKit's function-calling surface. */
export function memoryTools(): LiveKitFunctionTool[] {
	return memoryToolSpecs.map((spec) => ({
		name: spec.name,
		description: spec.description,
		parameters: spec.parameters,
	}))
}

export class LiveKitVoiceAdapter {
	readonly session: StreamingSession

	constructor(private readonly opts: LiveKitVoiceAdapterOptions) {
		this.session = new StreamingSession({
			sessionId: opts.sessionId,
			userId: opts.userId,
			client: opts.memory,
			onError: opts.onError,
		})
	}

	/** Hook into LiveKit's `on_user_transcript_updated`. */
	onPartialTranscript(text: string): void {
		this.session.appendPartial(text)
	}

	/** Hook into LiveKit's turn-complete / final-transcript event. */
	onFinalTranscript(text: string): void {
		this.session.commitTurn(text)
	}

	/** Answer a function call the agent decided to make. */
	async handleFunctionCall(call: {
		name: string
		arguments: Record<string, unknown> | string
	}): Promise<string> {
		const scope: AdapterScope = {
			userId: this.opts.userId,
			sessionId: this.opts.sessionId,
		}
		let input: Record<string, unknown>
		if (typeof call.arguments === "string") {
			try {
				input = call.arguments ? JSON.parse(call.arguments) : {}
			} catch {
				return "error: invalid arguments (not JSON)"
			}
		} else {
			input = call.arguments ?? {}
		}
		const res = await handleMemoryToolCall(
			this.opts.memory,
			{ name: call.name, input },
			scope,
		)
		return res.content
	}

	isMemoryFunction(name: string): boolean {
		return name === MEMORY_TOOL_NAMES.save || name === MEMORY_TOOL_NAMES.recall
	}

	/**
	 * Prefix the agent's system prompt with memories relevant to the
	 * current user utterance. Call this after `onFinalTranscript` and
	 * before the LLM turn.
	 */
	async buildContextPrefix(lastUserText: string, topK = 5): Promise<string> {
		return buildRecalledContext(this.opts.memory, lastUserText, {
			sessionId: this.opts.sessionId,
			userId: this.opts.userId,
			topK,
		})
	}
}
