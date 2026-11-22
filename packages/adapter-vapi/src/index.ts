import {
	type MemoryToolParamType,
	type AdapterScope,
	handleMemoryToolCall,
	MEMORY_TOOL_NAMES,
	type MemoryClient,
	memoryToolSpecs,
} from "@repo/core"
import type { StreamingSession } from "@repo/voice"

/**
 * Vapi calls your server URL with typed events for every turn of a
 * live call. This adapter accepts one event at a time, updates the
 * StreamingSession, and — for function calls — hands back the exact
 * response body Vapi expects.
 */

export interface VapiFunctionSpec {
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

/** Drop into your assistant's `functions` array in the Vapi dashboard or API. */
export function memoryFunctions(): VapiFunctionSpec[] {
	return memoryToolSpecs.map((spec) => ({
		name: spec.name,
		description: spec.description,
		parameters: spec.parameters,
	}))
}

/**
 * Minimal shape of a Vapi server-URL message. Vapi wraps its own
 * envelope but the interesting bits are always `type` and the payload.
 */
export interface VapiFunctionCallMessage {
	type: "function-call"
	functionCall: { name: string; parameters: Record<string, unknown> }
}
export interface VapiTranscriptMessage {
	type: "transcript"
	role: "user" | "assistant"
	transcript: string
	transcriptType: "partial" | "final"
}
export interface VapiOtherMessage {
	type: string
	[k: string]: unknown
}
export type VapiServerMessage =
	| VapiFunctionCallMessage
	| VapiTranscriptMessage
	| VapiOtherMessage

export interface HandleVapiOptions extends AdapterScope {
	memory: MemoryClient
	session?: StreamingSession
}

export interface HandleVapiResult {
	/** Body Vapi expects in the HTTP response, if any. */
	response?: { result: string } | { error: string }
	handled: boolean
}

/**
 * Route one Vapi server-URL message.
 *  - function-call → executes the memory tool, returns { result }.
 *  - transcript partial → session.appendPartial (non-blocking).
 *  - transcript final (user) → session.commitTurn (fire-and-forget save).
 *  - everything else → { handled: false }, safe to fall through.
 */
export async function handleVapiEvent(
	msg: VapiServerMessage,
	opts: HandleVapiOptions,
): Promise<HandleVapiResult> {
	if (msg.type === "function-call") {
		const call = (msg as VapiFunctionCallMessage).functionCall
		if (!call?.name) return { handled: false }
		if (
			call.name !== MEMORY_TOOL_NAMES.save &&
			call.name !== MEMORY_TOOL_NAMES.recall
		) {
			return { handled: false }
		}
		const res = await handleMemoryToolCall(
			opts.memory,
			{ name: call.name, input: call.parameters ?? {} },
			{ userId: opts.userId, sessionId: opts.sessionId },
		)
		return { response: { result: res.content }, handled: true }
	}

	if (msg.type === "transcript" && opts.session) {
		const t = msg as VapiTranscriptMessage
		if (t.role !== "user") return { handled: true }
		if (t.transcriptType === "partial") opts.session.appendPartial(t.transcript)
		else if (t.transcriptType === "final") opts.session.commitTurn(t.transcript)
		return { handled: true }
	}

	return { handled: false }
}
