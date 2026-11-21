/**
 * Voice self-correction handler. Every real caller retracts and refines
 * mid-utterance. Without this, we store the pre-retraction value as a
 * memory, which the recall path then serves back as "fact".
 *
 * Example:
 *   input:  "i live in powai, no... actual trikutta towers powai,
 *            room number 13... sorry 913"
 *   output: "trikutta towers powai, room number 913"
 *
 * The parser handles three patterns:
 *
 *  1. Retraction cue at a segment boundary. Strong cues (no / actually /
 *     sorry / wait / I mean / scratch that) default to replacing the
 *     prior segment — that's what the cue actually signals.
 *
 *  2. Slot-level patch. If the new segment is a bare value (a lone
 *     number, an email, a phone) we patch just that slot into the
 *     prior segment instead of replacing it wholesale.
 *
 *  3. "and X" continuation inside a segment. After a retraction cue,
 *     "…and Y is Z" splits the segment so the first half corrects the
 *     prior and the second half is a fresh clause.
 *
 * Deterministic regex + set logic. Phase 8 replaces with a distilled
 * LM once we have real call data to train on.
 */

const STRONG_CUES = [
	"scratch that",
	"let me correct",
	"my mistake",
	"my bad",
	"no wait",
	"no actually",
	"actually no",
	"sorry no",
	"wait no",
	"no i mean",
	"i mean",
	"i meant",
	"correction",
	"actually",
	"sorry",
	"actual",
	"actualy",
]

// Romanized-Hindi cues are everyday words too ("mujhe nahi pata"), so
// they only count when they OPEN a clause right after punctuation:
// "ek do teen, nahi teen do ek".
const CLAUSE_INITIAL_CUES = ["nahi nahi", "nahi", "matlab", "galti se"]
// Likewise a clause-initial "no" directly followed by a number ("flat 21,
// no 12") is a correction, while "…, no problem" is not.

// Standalone "no" separated from surrounding words by punctuation or a
// pause marker (…). We do NOT match "no" as a full word in general —
// too many false positives ("no problem", "no one is home").
const CUE_PATTERN = new RegExp(
	`(?:^|[\\s,.\\-—])(${STRONG_CUES.map((c) => c.replace(/\s+/g, "\\s+"))
		.sort((a, b) => b.length - a.length)
		.join(
			"|",
		)})(?=\\b)|(?:^|[\\s])no[\\s]*[,.\\-—…]+|(?:[,.\\-—…]\\s*)(?:${CLAUSE_INITIAL_CUES.join("|")})(?=\\s)|(?:[,.\\-—…]\\s*)no(?=\\s+\\d)`,
	"gi",
)

const BARE_NUMBER = /^\s*\d+\s*$/
const BARE_EMAIL =
	/^\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\s*[.!]?\s*$/
const BARE_PHONE = /^\s*\+?\d[\d\s\-()]{5,}\s*$/

const CONTENT_ANCHORS = [
	"address",
	"live",
	"living",
	"stay",
	"staying",
	"house",
	"home",
	"flat",
	"apartment",
	"room",
	"floor",
	"unit",
	"number",
	"phone",
	"mobile",
	"contact",
	"email",
	"name",
	"extension",
	"company",
	"office",
	"work",
	"city",
	"pincode",
	"zip",
]

import { tokenize } from "./tokenize.ts"

const FRAGMENT_MAX_TOKENS = 4

// Previously a fixed English function-word list. Real stopword filtering
// (corpus-relative IDF, see tokenize.ts) needs a per-tenant document-
// frequency table this module doesn't have access to. Rather than fake
// language-neutrality with a bigger hardcoded list, this now does the one
// thing that's honestly language-agnostic without corpus stats: drop very
// short tokens (which correlates with function words across most scripts
// without asserting anything about which words those are).

export interface Correction {
	kind: "replace" | "patch"
	retracted: string
	kept: string
}

export interface SelfCorrectionResult {
	text: string
	corrections: Correction[]
	segments: string[]
}

export function applySelfCorrection(input: string): SelfCorrectionResult {
	const trimmed = input.trim()
	if (!trimmed) return { text: "", corrections: [], segments: [] }

	const rawSegments = splitOnCues(trimmed)
	if (rawSegments.length <= 1) {
		return {
			text: trimmed,
			corrections: [],
			segments: rawSegments.map((seg) => seg.text),
		}
	}

	// Second pass: some segments carry two ideas separated by "and" —
	// split them so slot-patches don't accidentally eat the second idea.
	// Pieces after a ". and" split begin a new sentence by construction.
	const parts: Segment[] = []
	for (const seg of rawSegments) {
		splitOnAnd(seg.text).forEach((text, i) => {
			if (text) {
				parts.push(
					i === 0
						? { text, startsSentence: seg.startsSentence }
						: { text, startsSentence: true, continuation: true },
				)
			}
		})
	}
	const segments = parts.map((seg) => seg.text)

	const corrections: Correction[] = []
	const kept: string[] = []

	for (let i = 0; i < segments.length; i++) {
		const current = segments[i]!
		if (!current) continue

		// Bare value → slot-patch the immediately-prior segment.
		const patched = tryPatch(kept[kept.length - 1], current)
		if (patched) {
			corrections.push({
				kind: "patch",
				retracted: kept[kept.length - 1]!,
				kept: patched,
			})
			kept[kept.length - 1] = patched
			continue
		}

		// If there IS a prior segment and this one shares an anchor with
		// it — same conceptual slot — replace the prior wholesale.
		if (
			kept.length > 0 &&
			!parts[i]!.continuation &&
			sharesAnchorOrEntity(
				kept[kept.length - 1]!,
				current,
				parts[i]!.startsSentence,
			)
		) {
			corrections.push({
				kind: "replace",
				retracted: kept[kept.length - 1]!,
				kept: current,
			})
			kept[kept.length - 1] = current
			continue
		}

		kept.push(current)
	}

	return {
		text: kept.join(", "),
		corrections,
		segments,
	}
}

interface Segment {
	text: string
	/** True when the cue that introduced this segment opened a new sentence (prior text ended in . ! ? or ।). */
	startsSentence: boolean
	/** Split off by ". and …" — an added fact, never a correction. */
	continuation?: boolean
}

const SENTENCE_END = /[.!?\u0964]\s*$/u

function splitOnCues(text: string): Segment[] {
	const out: Segment[] = []
	let last = 0
	let startsSentence = false
	for (const match of text.matchAll(CUE_PATTERN)) {
		if (match.index === undefined) continue
		const before = text.slice(last, match.index)
		if (before.trim()) {
			out.push({ text: cleanEdges(before), startsSentence })
		}
		startsSentence = SENTENCE_END.test(before)
		last = match.index + match[0].length
	}
	const tail = text.slice(last)
	if (tail.trim()) out.push({ text: cleanEdges(tail), startsSentence })
	return out.filter((seg) => seg.text)
}

function splitOnAnd(segment: string): string[] {
	// Split on ". and" or "; and" but not just plain " and "
	// (too many false positives inside a single content phrase).
	return segment
		.split(/[.;]\s+and\s+/i)
		.map(cleanEdges)
		.filter(Boolean)
}

function cleanEdges(text: string): string {
	return text
		.trim()
		.replace(/^[,.\s—\-…]+/, "")
		.replace(/[,.\s—\-…]+$/, "")
		.trim()
}

function tryPatch(prior: string | undefined, current: string): string | null {
	if (!prior) return null
	if (BARE_NUMBER.test(current)) {
		const value = current.trim()
		return replaceLastToken(prior, /\b\d+\b/g, value)
	}
	if (BARE_EMAIL.test(current)) {
		const value = current.trim().replace(/[.!]$/, "")
		const patched = replaceLastToken(
			prior,
			/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
			value,
		)
		return patched
	}
	if (BARE_PHONE.test(current) && /\d/.test(prior)) {
		const value = current.trim()
		return replaceLastToken(prior, /\+?\d[\d\s\-()]{5,}/g, value)
	}
	// Spoken numbers ("one two three four", "ek do teen") are values too:
	// replace the prior clause's trailing run of number words, keeping its
	// frame — "confirm my order one two three four … four three two one"
	// must store "confirm my order four three two one", not a bare value.
	const spoken = current.trim().replace(/[.!,]+$/, "")
	if (isSpokenNumber(spoken)) {
		const words = prior.trim().split(/\s+/)
		let start = words.length
		while (start > 0 && isNumberWord(stripPunct(words[start - 1]!))) start--
		if (start < words.length && start > 0) {
			return [...words.slice(0, start), spoken].join(" ")
		}
	}
	return null
}

const NUMBER_WORDS = new Set([
	// English
	"zero",
	"oh",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
	"double",
	"triple",
	// Romanized Hindi
	"shunya",
	"ek",
	"do",
	"teen",
	"char",
	"chaar",
	"paanch",
	"panch",
	"chhe",
	"chhah",
	"saat",
	"aath",
	"nau",
	"das",
])

function stripPunct(w: string): string {
	return w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
}

function isNumberWord(w: string): boolean {
	return NUMBER_WORDS.has(w) || /^\d+$/.test(w)
}

/** Two or more number words / digit groups and nothing else. */
function isSpokenNumber(text: string): boolean {
	const words = text.split(/\s+/).map(stripPunct).filter(Boolean)
	return words.length >= 2 && words.every(isNumberWord)
}

function replaceLastToken(
	haystack: string,
	pattern: RegExp,
	replacement: string,
): string | null {
	const matches = Array.from(haystack.matchAll(pattern))
	if (matches.length === 0) return null
	const last = matches[matches.length - 1]!
	const start = last.index ?? 0
	return (
		haystack.slice(0, start) +
		replacement +
		haystack.slice(start + last[0].length)
	)
}

function sharesAnchorOrEntity(
	prev: string,
	next: string,
	nextStartsSentence: boolean,
): boolean {
	const pLower = prev.toLowerCase()
	const nLower = next.toLowerCase()
	for (const a of CONTENT_ANCHORS) {
		if (pLower.includes(a) && nLower.includes(a)) return true
	}

	const pw = new Set(contentWords(prev))
	const nw = new Set(contentWords(next))
	for (const w of nw) if (pw.has(w)) return true

	// Fallback: segments split by a retraction cue with no shared anchor.
	// A cue in the middle of a sentence ("my name is Ayush, sorry
	// Ayushpani", "…andheri, actually bandra west") is a self-correction:
	// replace. A cue that OPENS a new sentence followed by a full clause
	// ("I love sushi. Sorry, I have a meeting at 5pm") is new information
	// — replacing would silently drop the first fact. A short fragment
	// after a full stop ("I live in Powai. Actually, Andheri.") is still a
	// correction. Decided per boundary, so it holds however many cues the
	// turn contains.
	if (!nextStartsSentence) return true
	return tokenize(next).length <= FRAGMENT_MAX_TOKENS
}

function contentWords(text: string): string[] {
	return tokenize(text).filter((w) => w.length >= 3)
}
