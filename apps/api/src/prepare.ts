import { applySelfCorrection, normalizeCodeSwitched } from "@repo/language"

// NOTE: @repo/core also exports applySelfCorrectionSemantic — an
// embedding-prototype cue classifier meant to replace the English cue
// list in @repo/language. It is not wired in: against HashEmbedder it
// regresses the self-correction suite (no real semantics to compare), so
// it needs validation with a real semantic embedder first.

const ONE_WORD = /^\s*\S+\s*\??\s*$/

// A question asks for information or confirmation; it doesn't tell us
// anything to remember. Requests ("can I see Dr. Mehta on Friday?") do, so
// they are kept.
const WH_START =
	/^(what|what's|whats|when|when's|where|where's|who|who's|whom|whose|which|why|how|how's)\b/i
const CONFIRM_START =
	/^(is|isn't|are|aren't|was|were|do|don't|does|doesn't|did|didn't|am|has|have|had)\b/i
// Romanized Hindi question words anywhere in the sentence: "mera order kya hai?"
const HINDI_Q =
	/\b(kya|kab|kahan|kahaan|kaun|kaunsa|kitna|kitne|kitni|kaise|kyun|kyon)\b/i
const DEVANAGARI_Q = /(क्या|कब|कहाँ|कहां|कौन|कितना|कितने|कितनी|कैसे|क्यों)/

/** Split a turn into sentences, keeping each sentence's own punctuation. */
export function sentences(text: string): string[] {
	return text
		.split(/(?<=[.!?।])\s+/)
		.map((s) => s.trim())
		.filter(Boolean)
}

/**
 * True for a sentence that only asks: "is that 13 or 913?", "when is my
 * appointment?", "mera order kya hai?". Statements that end in a tag
 * ("my address is 12 MG Road, right?") and requests ("could you wake me
 * at 6?") are not pure questions.
 */
export function isQuestionSentence(sentence: string): boolean {
	const s = sentence
		.trim()
		.replace(/^(and|so|but|also|ok|okay|hi|hello|haan|accha|achha)[,\s]+/i, "")
	if (!/[?？]\s*$/.test(s)) return false
	return (
		WH_START.test(s) ||
		CONFIRM_START.test(s) ||
		HINDI_Q.test(s) ||
		DEVANAGARI_Q.test(s)
	)
}

/** True when every sentence of the turn only asks something. */
export function isPureQuestion(text: string): boolean {
	const parts = sentences(text)
	return parts.length > 0 && parts.every(isQuestionSentence)
}

export type PreparedText =
	| { skip: "question-or-tooshort" }
	| { skip?: undefined; text: string; metadata: Record<string, unknown> }

/**
 * The single text-cleaning pipeline every write path goes through
 * (POST /v1/memories and POST /v1/ingest/commit): question sentences out →
 * self-correction → code-switch normalization. Keeping one function
 * guarantees text and voice ingest store the same thing for the same
 * utterance.
 */
export function prepareText(raw: string): PreparedText {
	// Drop the sentences that only ask; keep what the caller told us.
	const parts = sentences(raw)
	const questions = parts.filter(isQuestionSentence)
	const kept = parts.filter((p) => !isQuestionSentence(p)).join(" ")
	if (!kept || ONE_WORD.test(kept)) {
		return { skip: "question-or-tooshort" }
	}
	const corrected = applySelfCorrection(kept)
	const norm = normalizeCodeSwitched(corrected.text)
	return {
		text: norm.text,
		metadata: {
			originalText: raw,
			...(questions.length ? { questionsDropped: questions } : {}),
			correctedText: corrected.text,
			corrections: corrected.corrections,
			fillersRemoved: norm.removed,
			codeSwitched: norm.wasCodeSwitched,
			primaryLanguage: norm.primary,
		},
	}
}
