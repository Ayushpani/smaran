import { corroborate, mean, neutralBelief, type Belief } from "./belief.ts"

/**
 * Per-user consolidated profile: fold recurring facts across many
 * memories/sessions into one standing summary a voice agent can fetch by
 * a single point-lookup at call start, instead of paying a fresh vector
 * search for facts that never change turn to turn (Hindsight's "mental
 * model" / "observation" pattern).
 *
 * Clustering here is plain cosine-threshold single-linkage over
 * already-computed embeddings — the same math
 * `packages/memory-consolidator`'s Rust/WASM `detect_clusters()` does
 * (real Louvain modularity optimization, not just thresholding), but that
 * crate has no built `.wasm` artifact in this environment (no
 * `wasm32-unknown-unknown` target, no `wasm-pack` installed) — swap this
 * for that crate once it's built; the algorithm upgrade (threshold ->
 * modularity) doesn't change this module's call shape.
 */

export interface ClusterableMemory {
	id: string
	text: string
	embedding: Float32Array
}

export interface ProfileResult {
	summary: string
	belief: Belief
	sourceMemoryIds: string[]
}

const CLUSTER_SIMILARITY_THRESHOLD = 0.65
const MIN_EVIDENCE_TO_INCLUDE = 2 // a fact mentioned only once isn't "recurring" yet

/** Union-find single-linkage clustering: memories join a cluster if cosine similarity to ANY existing member exceeds the threshold. */
export function clusterMemories(
	memories: ClusterableMemory[],
	threshold: number = CLUSTER_SIMILARITY_THRESHOLD,
): ClusterableMemory[][] {
	const parent = memories.map((_, i) => i)
	function find(start: number): number {
		let i = start
		while (parent[i] !== i) {
			parent[i] = parent[parent[i]!]!
			i = parent[i]!
		}
		return i
	}
	function union(a: number, b: number) {
		const ra = find(a)
		const rb = find(b)
		if (ra !== rb) parent[ra] = rb
	}

	for (let i = 0; i < memories.length; i++) {
		for (let j = i + 1; j < memories.length; j++) {
			if (cosine(memories[i]?.embedding, memories[j]?.embedding) >= threshold) {
				union(i, j)
			}
		}
	}

	const groups = new Map<number, ClusterableMemory[]>()
	for (let i = 0; i < memories.length; i++) {
		const root = find(i)
		const g = groups.get(root) ?? []
		g.push(memories[i]!)
		groups.set(root, g)
	}
	return Array.from(groups.values())
}

/**
 * Fold clusters into one profile: each well-supported cluster (>= 2
 * corroborating memories) contributes its longest member as the
 * representative statement — usually the most complete phrasing of the
 * fact. Belief accumulates via Beta-Binomial corroboration, one update
 * per additional member, so a profile built from 5 corroborating
 * mentions is measurably more confident (lower variance) than one built
 * from 2, not just a bigger number from a single LLM guess.
 */
export function consolidateProfile(
	memories: ClusterableMemory[],
	minEvidence: number = MIN_EVIDENCE_TO_INCLUDE,
	/** Cosine similarity at which two memories are "the same topic" — model-specific; see Embedder.topicSimilarity. */
	threshold: number = CLUSTER_SIMILARITY_THRESHOLD,
): ProfileResult | null {
	const clusters = clusterMemories(memories, threshold).filter(
		(c) => c.length >= minEvidence,
	)
	if (clusters.length === 0) return null

	const lines: string[] = []
	const sourceMemoryIds: string[] = []
	let belief = neutralBelief()

	for (const cluster of clusters) {
		const representative = [...cluster].sort(
			(a, b) => b.text.length - a.text.length,
		)[0]!
		lines.push(representative.text)
		for (const m of cluster) sourceMemoryIds.push(m.id)
		for (let i = 1; i < cluster.length; i++) belief = corroborate(belief)
	}

	// Strip each line's own terminal punctuation so joining doesn't yield "lake.. Tea".
	const summary = `${lines.map((l) => l.trim().replace(/[\p{Sentence_Terminal}\s]+$/u, "")).join(". ")}.`
	return { summary, belief, sourceMemoryIds }
}

function cosine(a: Float32Array, b: Float32Array): number {
	const len = Math.min(a.length, b.length)
	let dot = 0
	let na = 0
	let nb = 0
	for (let i = 0; i < len; i++) {
		const av = a[i]!
		const bv = b[i]!
		dot += av * bv
		na += av * av
		nb += bv * bv
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb)
	return denom === 0 ? 0 : dot / denom
}

export { mean as profileConfidence }
