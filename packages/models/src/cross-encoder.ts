import { normalizeCodeSwitched } from "@repo/language"
import type { RerankCandidate, Reranker, RerankResult } from "./reranker.ts"

/**
 * Free, in-process cross-encoder reranker (ONNX on CPU via
 * transformers.js). A cross-encoder reads the query and each candidate
 * together, so it judges relevance far better than vector similarity —
 * at the cost of one forward pass per candidate, which is why it only
 * re-orders a small pool the fast channels already found.
 *
 * Measured on LoCoMo (3 conversations, 383 questions, pool of 20):
 * hit@1 36.3% → 53.5%, hit@10 71.0% → 78.1%, ~70 ms p50 on 4 vCPU.
 * See RESULTS.md.
 *
 * Default model ms-marco-MiniLM-L-6-v2 (Apache-2.0) is English-only. On a
 * mixed English/Hindi/Hinglish set neither it nor a multilingual
 * cross-encoder beat the fused ranking, so `shouldRerank` gates reranking
 * to English queries over mostly-English candidates.
 */

export const DEFAULT_CROSS_ENCODER = "Xenova/ms-marco-MiniLM-L-6-v2"
const BATCH_SIZE = 5

export interface CrossEncoderOptions {
	model?: string
	cacheDir?: string
	/** Max tokens per (query, candidate) pair. Memories are short; 256 is plenty. */
	maxLength?: number
}

type Tokenizer = (texts: string[], opts: Record<string, unknown>) => unknown
type SequenceClassifier = (
	inputs: unknown,
) => Promise<{ logits: { data: Float32Array | number[] } }>

export interface LocalCrossEncoder extends Reranker {
	warm(): Promise<void>
}

export function createLocalCrossEncoder(
	opts: CrossEncoderOptions = {},
): LocalCrossEncoder {
	const modelId = opts.model ?? DEFAULT_CROSS_ENCODER
	const maxLength = opts.maxLength ?? 256
	let loaded: Promise<{ tok: Tokenizer; model: SequenceClassifier }> | null =
		null

	function load() {
		if (!loaded) {
			loaded = (async () => {
				const tf = await import("@huggingface/transformers")
				if (opts.cacheDir) tf.env.cacheDir = opts.cacheDir
				const tok = (await tf.AutoTokenizer.from_pretrained(
					modelId,
				)) as unknown as Tokenizer
				const model =
					(await tf.AutoModelForSequenceClassification.from_pretrained(
						modelId,
						{
							dtype: "q8",
						},
					)) as unknown as SequenceClassifier
				return { tok, model }
			})()
			loaded.catch(() => {
				loaded = null
			})
		}
		return loaded
	}

	return {
		model: modelId,
		async warm() {
			await load()
		},
		async rerank(
			query: string,
			candidates: RerankCandidate[],
			topK = candidates.length,
		): Promise<RerankResult> {
			const start = performance.now()
			if (candidates.length === 0) {
				return { candidates: [], rerankMs: 0, model: modelId }
			}
			const { tok, model } = await load()
			// Score in small batches of similar length: a batch is padded to
			// its longest pair, so one long memory would otherwise make every
			// candidate pay for it (measured: p95 107 ms → 65 ms for 20).
			const order = candidates
				.map((c, i) => [c.text.length, i] as const)
				.sort((a, b) => a[0] - b[0])
				.map(([, i]) => i)
			const scores = new Array<number>(candidates.length)
			for (let b = 0; b < order.length; b += BATCH_SIZE) {
				const idx = order.slice(b, b + BATCH_SIZE)
				const inputs = tok(
					idx.map(() => query),
					{
						text_pair: idx.map((i) => candidates[i]!.text),
						padding: true,
						truncation: true,
						max_length: maxLength,
					},
				)
				const out = await model(inputs)
				const logits = Array.from(out.logits.data)
				const perRow = logits.length / idx.length
				// Single-logit relevance heads: the last column is the score.
				idx.forEach((i, k) => {
					scores[i] = logits[k * perRow + (perRow - 1)]!
				})
			}
			const scored = candidates.map((c, i) => ({ ...c, score: scores[i]! }))
			scored.sort((a, b) => b.score - a.score)
			return {
				candidates: scored.slice(0, topK),
				rerankMs: Math.round(performance.now() - start),
				model: modelId,
			}
		},
	}
}

/**
 * Rerank only where the English cross-encoder is known to help: an
 * English query over candidates that are mostly English. Hindi/Hinglish
 * queries or pools keep the fused order (no measured gain there).
 */
export function shouldRerank(query: string, candidateTexts: string[]): boolean {
	if (!isEnglish(query) || candidateTexts.length === 0) return false
	const english = candidateTexts.filter(isEnglish).length
	return english / candidateTexts.length >= 0.7
}

function isEnglish(text: string): boolean {
	const r = normalizeCodeSwitched(text)
	return r.primary === "en" && !r.wasCodeSwitched
}
