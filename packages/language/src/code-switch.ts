import { detectLanguage } from "./detect.ts"

/**
 * Hindi/Hinglish filler removal without touching content-carrying words.
 * These are the words that add nothing to semantic recall but appear in
 * every casual Indian voice turn. Only stripped when surrounded by other
 * content — a standalone "haan" is a real answer.
 */
const HINDI_FILLERS = new Set([
	"matlab",
	"yaani",
	"achha",
	"acha",
	"haan",
	"arre",
	"arey",
	"thoda",
	"basically",
	"actually",
	"toh",
	"toh?",
	"na",
	"nah",
	"hmm",
	"hmmm",
	"ok",
	"okay",
	"yeah",
	"yeh",
	"ye",
	"vo",
	"woh",
	"kya",
	"bs",
	"bas",
])

const DEVANAGARI_FILLERS = new Set([
	"मतलब",
	"यानी",
	"अच्छा",
	"हाँ",
	"अरे",
	"थोड़ा",
	"तो",
	"न",
	"ना",
	"क्या",
	"बस",
])

const CONTENT_FLOOR = 3

/**
 * Common romanized-Hindi tokens that Latin-only Unicode detection
 * cannot catch. Presence of any of these in an otherwise Latin
 * transcript flags the utterance as Hinglish. Deliberately narrow —
 * these are words with no common English collision. Phase 5 replaces
 * with a distilled classifier trained on real call data.
 */
const HINGLISH_MARKERS = new Set([
	"hai",
	"hain",
	"tha",
	"thi",
	"the",
	"ho",
	"hoga",
	"hogi",
	"kya",
	"kyun",
	"kyon",
	"kaise",
	"kaisa",
	"kaha",
	"kahan",
	"kab",
	"kaun",
	"koi",
	"kuch",
	"nahi",
	"nahin",
	"mera",
	"meri",
	"mere",
	"tera",
	"teri",
	"tere",
	"tumhara",
	"aap",
	"apna",
	"apni",
	"apne",
	"hum",
	"humara",
	"humari",
	"tum",
	"main",
	"beti",
	"beta",
	"bhai",
	"behen",
	"maa",
	"papa",
	"pita",
	"mata",
	"pasand",
	"acha",
	"achha",
	"bahut",
	"thoda",
	"thodi",
	"jyada",
	"zyada",
	"phir",
	"lekin",
	"magar",
	"aur",
	"ya",
	"agar",
	"toh",
	"chahiye",
	"hoga",
	"karna",
	"karo",
	"karta",
	"karti",
	"karte",
	"jana",
	"aana",
	"khana",
	"pina",
	"dena",
	"lena",
	"batana",
])

function hinglishMarkerCount(text: string): number {
	let count = 0
	for (const token of text.toLowerCase().split(/[^a-z]+/)) {
		if (HINGLISH_MARKERS.has(token)) count += 1
	}
	return count
}

export interface NormalizeResult {
	text: string
	removed: number
	wasCodeSwitched: boolean
	primary: string
}

/**
 * Normalize a mixed-language transcript. Removes fillers in both
 * scripts, collapses whitespace, preserves proper nouns and numbers.
 * Never translates — code-switched content stays code-switched, so the
 * embedder can pick up the actual meaning.
 */
export function normalizeCodeSwitched(text: string): NormalizeResult {
	const detection = detectLanguage(text)
	const romanizedHinglish =
		detection.primary === "en" && hinglishMarkerCount(text) >= 2
	const codeSwitched = detection.codeSwitched || romanizedHinglish
	const primary = romanizedHinglish ? "mixed" : detection.primary
	const tokens = text.split(/\s+/).filter(Boolean)
	if (tokens.length < CONTENT_FLOOR) {
		return {
			text: text.trim(),
			removed: 0,
			wasCodeSwitched: codeSwitched,
			primary,
		}
	}
	let removed = 0
	const kept: string[] = []
	for (const raw of tokens) {
		const stripped = raw.replace(/[.,!?;:।]+$/g, "")
		const lower = stripped.toLowerCase()
		if (HINDI_FILLERS.has(lower) || DEVANAGARI_FILLERS.has(stripped)) {
			removed += 1
			continue
		}
		kept.push(raw)
	}
	// If we stripped everything, keep the original — heuristics should not
	// erase meaning even when the transcript looks like pure filler.
	if (kept.length < CONTENT_FLOOR) {
		return {
			text: text.trim(),
			removed: 0,
			wasCodeSwitched: codeSwitched,
			primary,
		}
	}
	return {
		text: kept
			.join(" ")
			.replace(/\s{2,}/g, " ")
			.trim(),
		removed,
		wasCodeSwitched: codeSwitched,
		primary,
	}
}
