import type { SaveInput } from "./types.ts"

export interface ConsolidatorCandidate {
	text: string
	/**
	 * Left unset by segmentation-only consolidators (e.g.
	 * HeuristicConsolidator below) — core.ts save() fills it in via
	 * classify.ts's embedding-nearest-centroid classifier, reusing the
	 * same embedding it computes for storage. A future consolidator that
	 * already knows the kind (e.g. an LLM-driven one) may set it directly
	 * to skip that step.
	 */
	kind?: "fact" | "preference" | "event" | "entity"
}

export interface Consolidator {
	consolidate(input: SaveInput): Promise<ConsolidatorCandidate[]>
}

/**
 * Keeps a normal message whole and only chunks long text.
 *
 * Splitting every message into sentences was measured to hurt recall on
 * LoCoMo (hit@10 61.8% → 68.4% when turns stay whole): follow-up
 * sentences like "It was great." lose who and what they refer to. So a
 * message up to `maxChunkChars` is one memory; longer text (a pasted
 * document, a long transcript) is packed greedily into sentence-aligned
 * chunks of at most that size. Sentence boundaries use the Unicode
 * `Sentence_Terminal` property, so Devanagari । and full-width marks
 * count too.
 */
export class HeuristicConsolidator implements Consolidator {
	constructor(private readonly maxChunkChars = 500) {}

	async consolidate(input: SaveInput): Promise<ConsolidatorCandidate[]> {
		const text = input.text.trim()
		if (!text) return []
		if (text.length <= this.maxChunkChars) return [{ text }]

		const sentences = text
			.split(/(?<=\p{Sentence_Terminal})\s+|\n+/u)
			.map((s) => s.trim())
			.filter(Boolean)
		const chunks: string[] = []
		let cur = ""
		for (const sentence of sentences) {
			if (cur && cur.length + 1 + sentence.length > this.maxChunkChars) {
				chunks.push(cur)
				cur = sentence
			} else {
				cur = cur ? `${cur} ${sentence}` : sentence
			}
		}
		if (cur) chunks.push(cur)
		return chunks.map((c) => ({ text: c }))
	}
}
