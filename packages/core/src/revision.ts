import { tokenize } from "@repo/language"

/**
 * Decides how a newly stated fact relates to an existing one.
 *
 * Embedding similarity alone cannot make this call: with a real semantic
 * model, "I am allergic to peanuts" vs "…penicillin" scores HIGHER than
 * "my room number is 13" vs "…913". Auto-replacing on similarity would
 * silently hide a medical fact. So the decision is lexical and
 * embedder-independent — it compares sentence *frames*:
 *
 *  - duplicate: same words (ignoring case/punctuation). Store nothing new;
 *    corroborate the existing memory instead.
 *  - replace:   same leading frame, and the only thing that changed is a
 *    value token (number, email, phone). "my room number is 13" → "…913".
 *    The old memory's validity is closed (still visible via `asOf`).
 *  - related:   same leading frame, other words changed ("allergic to
 *    peanuts" → "…penicillin", "I live in Powai" → "…Andheri"). Could be
 *    an update or an additional fact — we can't know, so BOTH stay
 *    current; the old one's confidence is lowered so the newer ranks
 *    first, and the new one links to it via `supersedesId`.
 *  - none:      unrelated.
 */
export type RevisionKind = "duplicate" | "replace" | "related" | "none"

// Three words is the smallest real slot frame ("my phone is", "I live in");
// two ("I prefer", "I like") is a multi-valued category, not a slot.
const MIN_FRAME_TOKENS = 3
const MIN_FRAME_RATIO = 0.6
const VALUE_TOKEN = /^(?:\+?\d[\d\-().]*|[^\s@]+@[^\s@]+\.[^\s@]+)$/

// Emails and phone numbers are kept whole — the word tokenizer would
// otherwise split "old@example.com" into pieces and hide that it's one value.
const WHOLE_VALUE = /[^\s@]+@[^\s@]+\.[^\s@.,;!?]+|\+?\d[\d\s\-().]{5,}\d/g

function normalize(text: string): string[] {
	const out: string[] = []
	let last = 0
	for (const m of text.matchAll(WHOLE_VALUE)) {
		out.push(...tokenize(text.slice(last, m.index)))
		out.push(m[0].toLowerCase().replace(/\s+/g, ""))
		last = (m.index ?? 0) + m[0].length
	}
	out.push(...tokenize(text.slice(last)))
	return out
}

export function classifyRevision(
	existing: string,
	incoming: string,
): RevisionKind {
	const a = normalize(existing)
	const b = normalize(incoming)
	if (a.length === 0 || b.length === 0) return "none"
	if (a.length === b.length && a.every((t, i) => t === b[i])) return "duplicate"

	let prefix = 0
	while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
		prefix++
	const shorter = Math.min(a.length, b.length)
	// The frame must cover most of the shorter sentence and leave
	// something that actually differs on both sides or as an extension.
	if (prefix < MIN_FRAME_TOKENS || prefix / shorter < MIN_FRAME_RATIO)
		return "none"
	if (prefix === a.length && prefix === b.length) return "duplicate"

	const oldTail = a.slice(prefix)
	const newTail = b.slice(prefix)
	const isValues = (toks: string[]) =>
		toks.length > 0 && toks.every((t) => VALUE_TOKEN.test(t))
	if (isValues(oldTail) && isValues(newTail)) return "replace"
	return "related"
}
