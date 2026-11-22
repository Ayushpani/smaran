/**
 * Heuristic ASR cleanup — removes fillers, disfluencies, false starts.
 * Phase 4 replaces this with a distilled LM that handles code-switching
 * and coreference resolution. Until then this is deliberately narrow:
 * fixes what regex reliably catches, touches nothing it doesn't.
 */

// Only pure hesitation sounds. Words like "like" and "actually" are NOT
// fillers in general — "I like dark mode" is a preference and "actually"
// is a self-correction cue the downstream correction pass depends on.
// Stripping them silently corrupted saved memories.
const FILLERS = new Set(["um", "uh", "uhh", "umm", "er", "erm", "ah", "hmm"])

const REPEAT_WORD = /\b(\w+)(?:\s+\1\b){1,}/gi
const FALSE_START = /\b(\w{1,3})-\s+/g
const MULTI_SPACE = /\s{2,}/g
const TRAILING_PUNCT = /[,;:-]+$/g

export interface ScrubResult {
	text: string
	removed: number
}

export function scrubAsrText(input: string): ScrubResult {
	if (!input) return { text: "", removed: 0 }

	let text = input.trim().replace(REPEAT_WORD, "$1")
	text = text.replace(FALSE_START, "")

	const tokens = text.split(/\s+/)
	let removed = 0
	const kept: string[] = []
	for (const raw of tokens) {
		const stripped = raw.replace(/[.,!?;:]$/g, "").toLowerCase()
		if (FILLERS.has(stripped) || FILLERS.has(stripped.replace(/[\s]/g, "-"))) {
			removed++
			continue
		}
		kept.push(raw)
	}
	text = kept
		.join(" ")
		.replace(MULTI_SPACE, " ")
		.replace(TRAILING_PUNCT, "")
		.trim()
	return { text, removed }
}

/** True when the transcript is worth persisting — filters "um.", "ok ok", etc. */
export function isSubstantive(text: string): boolean {
	const cleaned = text.trim().replace(/[.,!?;:]/g, "")
	if (cleaned.length < 3) return false
	const words = cleaned.split(/\s+/).filter(Boolean)
	if (words.length < 2) return words.length === 1 && words[0]!.length >= 4
	return true
}
