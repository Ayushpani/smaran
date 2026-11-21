#!/usr/bin/env bun

/**
 * LoCoMo retrieval benchmark — a public long-term conversational memory
 * dataset (Maharana et al., 2024, snap-research/locomo): 10 multi-session
 * conversations, ~5.9k dialogue turns, ~2k questions, each question
 * labelled with the dialogue turn(s) that contain its answer.
 *
 * What this measures — retrieval only, no LLM, no paid API:
 *   1. Every dialogue turn is saved through POST /v1/memories, exactly as
 *      a customer would (full cleaning pipeline, revision logic, etc.).
 *      Each conversation is its own userId, so they never mix.
 *   2. Every question goes through POST /v1/recall (topK=10).
 *   3. A question counts as a hit@k if any of its labelled evidence turns
 *      is among the top-k results; "full@k" requires all of them.
 *
 * Category 5 ("adversarial": unanswerable by design) is excluded from the
 * headline numbers, matching common practice. Categories per the dataset:
 *   1 multi-hop, 2 temporal, 3 open-domain, 4 single-hop.
 *
 * This is NOT an end-to-end QA accuracy number (that needs an LLM judge).
 * It answers the narrower question this API is responsible for: does
 * recall surface the right memories?
 *
 * Run against a fresh API (memories from earlier runs would pollute it):
 *   bun run try                       # terminal 1
 *   bun run scripts/benchmark-locomo.ts   # terminal 2
 * Options: --limit=N (first N conversations), SMARAN_BASE_URL, SMARAN_API_KEY.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const BASE = process.env.SMARAN_BASE_URL ?? "http://localhost:8787"
const KEY = process.env.SMARAN_API_KEY ?? "sk_local_dev"
const DATA_URL =
	"https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json"
const CACHE = ".smaran/datasets/locomo10.json"
const TOP_K = 10
const limitArg = process.argv.find((a) => a.startsWith("--limit="))
const LIMIT = limitArg
	? Number(limitArg.split("=")[1])
	: Number.POSITIVE_INFINITY

interface Turn {
	speaker: string
	dia_id: string
	text: string
	blip_caption?: string
}
interface QA {
	question: string
	evidence: string[]
	category: number
}
interface Sample {
	sample_id: string
	conversation: Record<string, unknown>
	qa: QA[]
}

async function loadDataset(): Promise<Sample[]> {
	if (!existsSync(CACHE)) {
		mkdirSync(".smaran/datasets", { recursive: true })
		const res = await fetch(DATA_URL)
		if (!res.ok) throw new Error(`dataset download failed: ${res.status}`)
		writeFileSync(CACHE, await res.text())
	}
	return (await Bun.file(CACHE).json()) as Sample[]
}

async function post(path: string, body: unknown): Promise<unknown> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${BASE}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		})
		// Respect the API's rate limit rather than failing the run. Run the
		// API with a high RATE_LIMIT_PER_MINUTE (as `bun run try` does) so
		// throttling doesn't distort the latency numbers.
		if (res.status === 429 && attempt < 20) {
			await Bun.sleep(Number(res.headers.get("retry-after") ?? 1) * 1000)
			continue
		}
		if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
		return res.json()
	}
}

function pct(xs: number[], p: number): number {
	if (xs.length === 0) return 0
	const s = [...xs].sort((a, b) => a - b)
	return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!
}

const health = (await (await fetch(`${BASE}/health`)).json()) as {
	store: string
	embedder: string
}
const data = (await loadDataset()).slice(0, LIMIT)
console.log(
	`LoCoMo retrieval benchmark → ${BASE} (store=${health.store}, embedder=${health.embedder})`,
)

const saveMs: number[] = []
const recallMs: number[] = []
const CATS: Record<number, string> = {
	1: "multi-hop",
	2: "temporal",
	3: "open-domain",
	4: "single-hop",
}
interface Tally {
	n: number
	hit1: number
	hit5: number
	hit10: number
	full10: number
	rr: number
}
const tally = new Map<string, Tally>()
const bump = (key: string, t: Omit<Tally, "n">) => {
	const cur = tally.get(key) ?? {
		n: 0,
		hit1: 0,
		hit5: 0,
		hit10: 0,
		full10: 0,
		rr: 0,
	}
	cur.n++
	cur.hit1 += t.hit1
	cur.hit5 += t.hit5
	cur.hit10 += t.hit10
	cur.full10 += t.full10
	cur.rr += t.rr
	tally.set(key, cur)
}
let turnsSaved = 0

for (const sample of data) {
	const userId = `locomo_${sample.sample_id}`
	const conv = sample.conversation
	const sessions = Object.keys(conv)
		.filter((k) => /^session_\d+$/.test(k))
		.sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))

	for (const s of sessions) {
		for (const turn of conv[s] as Turn[]) {
			const caption = turn.blip_caption
				? ` [shares a photo: ${turn.blip_caption}]`
				: ""
			const t0 = performance.now()
			await post("/v1/memories", {
				userId,
				sessionId: `${userId}_${s}`,
				text: `${turn.speaker}: ${turn.text}${caption}`,
				metadata: { diaId: turn.dia_id },
			})
			saveMs.push(performance.now() - t0)
			turnsSaved++
		}
	}

	for (const qa of sample.qa) {
		if (!CATS[qa.category] || qa.evidence.length === 0) continue
		const t0 = performance.now()
		const res = (await post("/v1/recall", {
			userId,
			query: qa.question,
			topK: TOP_K,
		})) as { hits: Array<{ memory: { metadata: { diaId?: string } } }> }
		recallMs.push(performance.now() - t0)

		// A turn can be split into several memories (one per sentence);
		// collapse to the first rank each dialogue turn appears at.
		const ranked: string[] = []
		for (const h of res.hits) {
			const id = h.memory.metadata?.diaId
			if (id && !ranked.includes(id)) ranked.push(id)
		}
		const gold = new Set(qa.evidence.flatMap((e) => e.split(/[;,]\s*/)))
		const firstRank = ranked.findIndex((id) => gold.has(id))
		const r = {
			hit1: firstRank === 0 ? 1 : 0,
			hit5: firstRank >= 0 && firstRank < 5 ? 1 : 0,
			hit10: firstRank >= 0 ? 1 : 0,
			full10: [...gold].every((g) => ranked.includes(g)) ? 1 : 0,
			rr: firstRank >= 0 ? 1 / (firstRank + 1) : 0,
		}
		bump(CATS[qa.category]!, r)
		bump("ALL (cat 1-4)", r)
	}
	process.stdout.write(`  ${sample.sample_id} done\n`)
}

const pc = (x: number, n: number) => `${((100 * x) / n).toFixed(1)}%`
const rows = [...Object.values(CATS), "ALL (cat 1-4)"]
	.filter((k) => tally.has(k))
	.map((k) => {
		const t = tally.get(k)!
		return `| ${k} | ${t.n} | ${pc(t.hit1, t.n)} | ${pc(t.hit5, t.n)} | ${pc(t.hit10, t.n)} | ${pc(t.full10, t.n)} | ${(t.rr / t.n).toFixed(3)} |`
	})
const report = [
	`Conversations: ${data.length}  •  turns saved: ${turnsSaved}  •  store=${health.store}  •  embedder=${health.embedder}`,
	"",
	"| Category | Questions | Hit@1 | Hit@5 | Hit@10 | Full evidence@10 | MRR@10 |",
	"|---|---|---|---|---|---|---|",
	...rows,
	"",
	`Save   p50=${pct(saveMs, 50).toFixed(1)}ms  p95=${pct(saveMs, 95).toFixed(1)}ms  (n=${saveMs.length})`,
	`Recall p50=${pct(recallMs, 50).toFixed(1)}ms  p95=${pct(recallMs, 95).toFixed(1)}ms  (n=${recallMs.length})`,
].join("\n")
console.log(`\n${report}`)
mkdirSync(".smaran/results", { recursive: true })
const out = join(
	".smaran/results",
	`locomo-${health.store}-${health.embedder}.md`,
)
writeFileSync(out, `${report}\n`)
console.log(`\nwritten to ${out}`)
