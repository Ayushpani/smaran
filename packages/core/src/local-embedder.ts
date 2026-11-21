import type { Embedder } from "./embedder.ts"

/**
 * Free, in-process embedder — no API key, no per-call cost, no network
 * after the first model download. Runs an ONNX model on CPU via
 * transformers.js.
 *
 * Default model: multilingual-e5-small (384-dim, ~118 MB quantized), which
 * handles English, Hindi and romanized Hinglish in one vector space —
 * "mera ghar Andheri mein hai" lands next to "I live in Andheri".
 *
 * Output is zero-padded to `dim` (default 1536) so it fits the existing
 * vector(1536) column. Zero padding leaves dot products and norms — and
 * therefore cosine similarity — exactly unchanged. Never mix vectors from
 * different models in one database: they live in different spaces.
 */

export interface LocalEmbedderOptions {
	/** Hugging Face model id with ONNX weights. */
	model?: string
	/** Weight precision: "q8" (default, smallest/fastest) | "fp32" | "fp16". */
	dtype?: "q8" | "fp32" | "fp16"
	/** Directory the model is cached in after first download. */
	cacheDir?: string
	/** Output dimension; vectors are zero-padded up to this. */
	dim?: number
	/** Prefixes for asymmetric models. e5 expects "query: " / "passage: ". */
	queryPrefix?: string
	passagePrefix?: string
	/** Max texts per forward pass — bounds memory on large batches. */
	batchSize?: number
}

export const DEFAULT_LOCAL_MODEL = "Xenova/multilingual-e5-small"

type FeatureExtractor = (
	texts: string[],
	opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>

export interface LocalEmbedder extends Embedder {
	/** Loads the model now (download on first run) instead of on the first request. */
	warm(): Promise<void>
	readonly model: string
}

export function createLocalEmbedder(
	opts: LocalEmbedderOptions = {},
): LocalEmbedder {
	const model = opts.model ?? DEFAULT_LOCAL_MODEL
	const dim = opts.dim ?? 1536
	const isE5 = /e5/i.test(model)
	const queryPrefix = opts.queryPrefix ?? (isE5 ? "query: " : "")
	const passagePrefix = opts.passagePrefix ?? (isE5 ? "passage: " : "")
	const batchSize = opts.batchSize ?? 32

	let extractor: Promise<FeatureExtractor> | null = null
	function load(): Promise<FeatureExtractor> {
		if (!extractor) {
			extractor = (async () => {
				const tf = await import("@huggingface/transformers")
				if (opts.cacheDir) tf.env.cacheDir = opts.cacheDir
				const pipe = await tf.pipeline("feature-extraction", model, {
					dtype: opts.dtype ?? "q8",
				})
				return pipe as unknown as FeatureExtractor
			})()
			// A failed download must not poison every later call.
			extractor.catch(() => {
				extractor = null
			})
		}
		return extractor
	}

	function pad(v: number[]): Float32Array {
		if (v.length > dim) {
			throw new Error(
				`local embedder: model output ${v.length} exceeds dim ${dim}`,
			)
		}
		const out = new Float32Array(dim)
		out.set(v)
		return out
	}

	async function run(texts: string[], prefix: string): Promise<Float32Array[]> {
		if (texts.length === 0) return []
		const fe = await load()
		const out: Float32Array[] = []
		for (let i = 0; i < texts.length; i += batchSize) {
			const chunk = texts.slice(i, i + batchSize).map((t) => prefix + t)
			const res = await fe(chunk, { pooling: "mean", normalize: true })
			for (const v of res.tolist()) out.push(pad(v))
		}
		return out
	}

	return {
		dim,
		model,
		async warm() {
			await load()
		},
		embed: async (text) => (await run([text], passagePrefix))[0]!,
		embedBatch: (texts) => run(texts, passagePrefix),
		embedQuery: async (text) => (await run([text], queryPrefix))[0]!,
	}
}
