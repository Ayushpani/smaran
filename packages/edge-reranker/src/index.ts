// src/index.ts

// @ts-expect-error
import {
	init_reranker,
	rerank,
	rerank_agentic,
} from "../../reranker-wasm/pkg/reranker_wasm.js"

export interface RankedResult {
	id: string
	semantic_score: number
	final_score: number
	original_rank: number
}

export interface CandidateWithMetadata {
	id: string
	text: string
	created_at_ts: number
	last_accessed_ts: number
	is_core_profile: boolean
	relation_count: number
}

export interface AgenticConfig {
	semantic_weight?: number
	recency_weight?: number
	profile_weight?: number
	centrality_weight?: number
	recency_half_life_hours?: number
}

export class EdgeReranker {
	private initialized = false

	/**
	 * Initializes the reranker with the quantized ONNX model and tokenizer.
	 * This operation is synchronous but may take a few ms.
	 *
	 * @param modelBytes Uint8Array of the quantized ONNX model
	 * @param tokenizerBytes Uint8Array of tokenizer.json
	 */
	public init(modelBytes: Uint8Array, tokenizerBytes: Uint8Array): void {
		if (this.initialized) return
		init_reranker(modelBytes, tokenizerBytes)
		this.initialized = true
	}

	/**
	 * Standard cross-encoder semantic reranking.
	 */
	public rerank(query: string, candidates: string[], topK = 5): RankedResult[] {
		if (!this.initialized)
			throw new Error("Reranker not initialized. Call init() first.")
		const jsonStr = rerank(query, JSON.stringify(candidates), topK)
		return JSON.parse(jsonStr) as RankedResult[]
	}

	/**
	 * Advanced multi-variate agentic memory reranking factoring in semantic similarity, recency, profile traits, and graph centrality.
	 */
	public rerankAgentic(
		query: string,
		candidates: CandidateWithMetadata[],
		config: AgenticConfig = {},
		topK = 5,
	): RankedResult[] {
		if (!this.initialized)
			throw new Error("Reranker not initialized. Call init() first.")
		const currentTs = Date.now() / 1000
		const jsonStr = rerank_agentic(
			query,
			JSON.stringify(candidates),
			topK,
			JSON.stringify(config),
			currentTs,
		)
		return JSON.parse(jsonStr) as RankedResult[]
	}
}
