/**
 * The playground's agent turn. Server-only.
 *
 * This is the whole integration: recall before the reply, save after the
 * caller speaks. The code panel on /playground shows a trimmed copy of it.
 */
import {
	Smaran,
	type SmaranMemory,
	type SmaranRecallHit,
	type SmaranRecallResult,
} from "@smaranai/sdk-ts"
import type { Persona } from "./personas"

export interface ChatMessage {
	role: "user" | "assistant"
	content: string
}

export interface LlmConfig {
	baseUrl: string
	apiKey: string
	model: string
}

export interface TurnInput {
	persona: Persona
	/** Stable per visitor and persona, e.g. "pg-<id>-clinic". */
	callerId: string
	sessionId: string
	/** Empty when the call starts and the agent speaks first. */
	message: string
	history: ChatMessage[]
	memory: boolean
}

export interface TurnResult {
	reply: string
	recall: {
		hits: {
			text: string
			score: number
			createdAt: string
			channels?: SmaranRecallHit["channels"]
		}[]
		serverMs: SmaranRecallResult["latencyMs"] | null
		roundTripMs: number
	} | null
	saved: {
		memories: {
			text: string
			originalText?: string
			corrections: { retracted: string; kept: string }[]
			replaced: boolean
		}[]
		roundTripMs: number
	} | null
	llmMs: number
}

export function smaranFromEnv(): Smaran | null {
	const baseUrl = process.env.SMARAN_PLAYGROUND_URL
	const apiKey = process.env.SMARAN_PLAYGROUND_KEY
	if (!baseUrl || !apiKey) return null
	return new Smaran({ apiKey, baseUrl, timeoutMs: 8000 })
}

export function llmFromEnv(): LlmConfig | null {
	const apiKey = process.env.PLAYGROUND_LLM_API_KEY
	if (!apiKey) return null
	return {
		apiKey,
		baseUrl: (
			process.env.PLAYGROUND_LLM_BASE_URL ?? "https://api.groq.com/openai/v1"
		).replace(/\/$/, ""),
		model: process.env.PLAYGROUND_LLM_MODEL ?? "openai/gpt-oss-20b",
	}
}

export function buildSystemPrompt(
	p: Persona,
	memories: string[] | null,
	opening: boolean,
): string {
	const lines = [
		p.brief,
		"This is a phone call, so keep every reply to one or two short sentences. No lists, no markdown, no emoji.",
	]
	if (memories === null) {
		lines.push(
			"You have no memory of earlier calls. Treat the caller as someone you have never spoken to.",
		)
	} else if (memories.length) {
		lines.push(
			"What you remember about this caller from earlier calls, most relevant first. Use it naturally and never invent anything beyond it:",
			...memories.map((m) => `- ${m}`),
		)
	} else {
		lines.push("You have no memories of this caller yet.")
	}
	if (opening)
		lines.push(
			memories?.length
				? "The caller has just called again. Greet them and show, briefly, that you remember the most useful thing."
				: "The caller has just called. Greet them and ask how you can help.",
		)
	return lines.join("\n")
}

async function chat(
	llm: LlmConfig,
	system: string,
	history: ChatMessage[],
	message: string,
): Promise<string> {
	const messages = [
		{ role: "system", content: system },
		...history.slice(-10),
		...(message ? [{ role: "user", content: message }] : []),
	]
	const ctrl = new AbortController()
	const timer = setTimeout(() => ctrl.abort(), 20_000)
	try {
		const res = await fetch(`${llm.baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${llm.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: llm.model,
				messages,
				temperature: 0.5,
				max_tokens: 400,
			}),
			signal: ctrl.signal,
		})
		if (!res.ok) throw new Error(`language model returned HTTP ${res.status}`)
		const json = (await res.json()) as {
			choices?: { message?: { content?: string } }[]
		}
		const text = json.choices?.[0]?.message?.content?.trim()
		if (!text) throw new Error("language model returned an empty reply")
		return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
	} finally {
		clearTimeout(timer)
	}
}

const corrections = (m: SmaranMemory) =>
	(
		(m.metadata?.corrections as
			| { retracted: string; kept: string }[]
			| undefined) ?? []
	).map((c) => ({
		retracted: c.retracted,
		kept: c.kept,
	}))

export async function runTurn(
	smaran: Smaran,
	llm: LlmConfig,
	t: TurnInput,
): Promise<TurnResult> {
	const opening = !t.message
	let recall: TurnResult["recall"] = null

	// 1. Recall before the agent replies.
	if (t.memory) {
		const started = performance.now()
		const r = await smaran.recall({
			userId: t.callerId,
			query: opening ? t.persona.openingQuery : t.message,
			topK: 5,
		})
		recall = {
			hits: r.hits.map((h) => ({
				text: h.memory.text,
				score: h.score,
				createdAt: h.memory.createdAt,
				channels: h.channels,
			})),
			serverMs: r.latencyMs,
			roundTripMs: Math.round(performance.now() - started),
		}
	}

	// 2. Save what the caller said, while the model writes the reply.
	const saving =
		t.memory && !opening
			? (async () => {
					const started = performance.now()
					const memories = await smaran.save({
						userId: t.callerId,
						sessionId: t.sessionId,
						text: t.message,
						source: "voice",
					})
					return {
						memories,
						roundTripMs: Math.round(performance.now() - started),
					}
				})()
			: null

	// 3. Reply with the recalled memories in the prompt.
	const system = buildSystemPrompt(
		t.persona,
		t.memory ? (recall?.hits.map((h) => h.text) ?? []) : null,
		opening,
	)
	const llmStarted = performance.now()
	const reply = await chat(llm, system, t.history, t.message)
	const llmMs = Math.round(performance.now() - llmStarted)

	const s = saving ? await saving : null
	return {
		reply,
		recall,
		llmMs,
		saved: s
			? {
					roundTripMs: s.roundTripMs,
					memories: s.memories.map((m) => ({
						text: m.text,
						originalText: m.metadata?.originalText as string | undefined,
						corrections: corrections(m),
						replaced: !!m.supersedesId,
					})),
				}
			: null,
	}
}
