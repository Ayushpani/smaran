import { applySelfCorrection, normalizeCodeSwitched } from "@repo/language"

// NOTE: @repo/core also exports applySelfCorrectionSemantic — an
// embedding-prototype cue classifier meant to replace the English cue
// list in @repo/language. It is not wired in: against HashEmbedder it
// regresses the self-correction suite (no real semantics to compare), so
// it needs validation with a real semantic embedder first.

const QUESTION_TAIL = /\?\s*$/
const ONE_WORD = /^\s*\S+\s*\??\s*$/
const DECLARATIVE = /\b(i (am|have|live|want|prefer|need)|my|our|the)\b/i

/**
 * Turns like "is that 13 or 913?" are the agent or caller asking for
 * confirmation and shouldn't create memory. Only turns that are BOTH a
 * question AND lack a declarative subject are dropped — "yes it's 913"
 * still saves.
 */
export function isPureQuestion(text: string): boolean {
	return QUESTION_TAIL.test(text) && !DECLARATIVE.test(text)
}

export type PreparedText =
	| { skip: "question-or-tooshort" }
	| { skip?: undefined; text: string; metadata: Record<string, unknown> }

/**
 * The single text-cleaning pipeline every write path goes through
 * (POST /v1/memories and POST /v1/ingest/commit): question filter →
 * self-correction → code-switch normalization. Keeping one function
 * guarantees text and voice ingest store the same thing for the same
 * utterance.
 */
export function prepareText(raw: string): PreparedText {
	if (isPureQuestion(raw) || ONE_WORD.test(raw.trim())) {
		return { skip: "question-or-tooshort" }
	}
	const corrected = applySelfCorrection(raw)
	const norm = normalizeCodeSwitched(corrected.text)
	return {
		text: norm.text,
		metadata: {
			originalText: raw,
			correctedText: corrected.text,
			corrections: corrected.corrections,
			fillersRemoved: norm.removed,
			codeSwitched: norm.wasCodeSwitched,
			primaryLanguage: norm.primary,
		},
	}
}
