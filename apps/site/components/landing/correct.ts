/**
 * A deliberately small, in-browser version of Smaran's self-correction
 * (packages/language). It covers the common cases for the landing demo:
 * a retraction cue followed by a replacement that is either the same kind
 * of value (numbers, emails) or a whole clause. The server does more.
 */
const CUE2 = new Set([
	"no wait",
	"wait no",
	"i mean",
	"scratch that",
	"sorry no",
	"galti se",
	"nahi nahi",
	"my mistake",
])
const CUE1 = new Set(["wait", "sorry", "actually", "nahi", "matlab", "no"])
const NUMW = new Set(
	"zero oh one two three four five six seven eight nine ten eleven twelve ek do teen char chaar paanch chhe saat aath nau das".split(
		" ",
	),
)
const norm = (t: string) =>
	t.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
const endsClause = (t: string) => /[,;.]$/.test(t)
function kind(t: string): "email" | "num" | null {
	const n = norm(t)
	if (/^[^@\s]+@[^@\s]+\.[a-z]+$/.test(n)) return "email"
	if (/^\d+[a-z]?$/.test(n) || NUMW.has(n)) return "num"
	return null
}

export interface Correction {
	toks: string[]
	/** word | cue | retracted, per token */
	marks: ("word" | "cue" | "retracted")[]
	/** For the last cue token: which earlier tokens it retracts. */
	retractAt: number[][]
	/** Tokens that replaced retracted ones. */
	fixes: Set<number>
	/** Indices of tokens that survive, in order. */
	out: number[]
	kept: string[]
}

export function correct(sentence: string): Correction {
	const toks = sentence.trim().split(/\s+/).filter(Boolean)
	const marks: Correction["marks"] = toks.map(() => "word")
	const retractAt: number[][] = toks.map(() => [])
	const fixes = new Set<number>()
	const out: number[] = []
	let i = 0
	while (i < toks.length) {
		const two =
			i + 1 < toks.length ? `${norm(toks[i]!)} ${norm(toks[i + 1]!)}` : ""
		let cue = 0
		if (CUE2.has(two)) cue = 2
		else if (
			CUE1.has(norm(toks[i]!)) &&
			(norm(toks[i]!) !== "no" || endsClause(toks[i]!))
		)
			cue = 1
		if (cue && out.length) {
			for (let k = 0; k < cue; k++) marks[i + k] = "cue"
			const cueEnd = i + cue - 1
			i += cue
			const span: number[] = []
			while (i < toks.length) {
				span.push(i)
				i++
				if (endsClause(toks[i - 1]!)) break
			}
			if (!span.length) break
			let start: number | undefined
			let end: number | undefined
			const k0 = kind(toks[span[0]!]!)
			if (k0 && span.every((j) => kind(toks[j]!) === k0)) {
				let e = out.length - 1
				while (e >= 0 && kind(toks[out[e]!]!) !== k0) e--
				if (e >= 0) {
					end = e
					start = e
					while (start > 0 && kind(toks[out[start - 1]!]!) === k0) start--
				}
			}
			if (start === undefined || end === undefined) {
				end = out.length - 1
				start = out.length
				while (start > 0 && !endsClause(toks[out[start - 1]!]!)) start--
				if (start === out.length) {
					start = out.length - 1
					while (start > 0 && !endsClause(toks[out[start - 1]!]!)) start--
				}
			}
			const struck = out.slice(start, end + 1)
			for (const j of struck) marks[j] = "retracted"
			retractAt[cueEnd]!.push(...struck)
			for (const j of span) fixes.add(j)
			out.splice(start, end - start + 1, ...span)
			continue
		}
		out.push(i)
		i++
	}
	const kept = out.map((j) => toks[j]!)
	if (kept.length)
		kept[kept.length - 1] = kept[kept.length - 1]!.replace(/[,;]+$/, "")
	return { toks, marks, retractAt, fixes, out, kept }
}
