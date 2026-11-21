export interface Embedder {
	readonly dim: number
	/** Embeds stored content (a "passage"). */
	embed(text: string): Promise<Float32Array>
	embedBatch(texts: string[]): Promise<Float32Array[]>
	/** Embeds a search query. Optional — asymmetric models (e5, bge) encode queries differently; others fall back to embed(). */
	embedQuery?(text: string): Promise<Float32Array>
}

/**
 * Deterministic hash embedder — no network, no keys.
 * Not for production recall quality. Purpose: prove the pipeline end-to-end
 * before Phase 5 ships voice-tuned distilled embeddings.
 */
export class HashEmbedder implements Embedder {
	readonly dim: number
	constructor(dim = 1536) {
		this.dim = dim
	}
	async embed(text: string): Promise<Float32Array> {
		const v = new Float32Array(this.dim)
		let h = 2166136261 >>> 0
		for (let i = 0; i < text.length; i++) {
			h ^= text.charCodeAt(i)
			h = Math.imul(h, 16777619) >>> 0
		}
		for (let i = 0; i < this.dim; i++) {
			h ^= h << 13
			h ^= h >>> 17
			h ^= h << 5
			h >>>= 0
			v[i] = (h / 0xffffffff) * 2 - 1
		}
		let norm = 0
		for (let i = 0; i < this.dim; i++) norm += v[i]! * v[i]!
		norm = Math.sqrt(norm) || 1
		for (let i = 0; i < this.dim; i++) v[i]! /= norm
		return v
	}
	async embedBatch(texts: string[]): Promise<Float32Array[]> {
		return Promise.all(texts.map((t) => this.embed(t)))
	}
}

export interface OpenAIEmbedderOptions {
	apiKey: string
	model?: string
	dim?: number
	baseUrl?: string
}

/**
 * OpenAI-compatible embedder. Works with OpenAI proper, Together, Groq,
 * DeepSeek, Ollama, LM Studio — any endpoint speaking /v1/embeddings.
 */
export function createOpenAIEmbedder(opts: OpenAIEmbedderOptions): Embedder {
	const model = opts.model ?? "text-embedding-3-small"
	const dim = opts.dim ?? 1536
	const base = (opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")

	const call = async (input: string[]): Promise<Float32Array[]> => {
		const res = await fetch(`${base}/embeddings`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${opts.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ input, model }),
		})
		if (!res.ok) {
			throw new Error(`embedder: ${res.status} ${await res.text()}`)
		}
		const json = (await res.json()) as {
			data: { embedding: number[] }[]
		}
		return json.data.map((d) => Float32Array.from(d.embedding))
	}

	return {
		dim,
		embed: async (text) => (await call([text]))[0]!,
		embedBatch: (texts) => call(texts),
	}
}
