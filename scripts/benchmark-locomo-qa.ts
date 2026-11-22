#!/usr/bin/env bun

/**
 * LoCoMo end-to-end answer accuracy (LLM-as-judge) — the protocol most
 * memory products publish, so the numbers are comparable:
 *
 *   1. Ingest every dialogue turn via POST /v1/memories (one userId per
 *      conversation), with the session's date in metadata.
 *   2. For each question (categories 1–4), POST /v1/recall (topK).
 *   3. An ANSWER model replies using only the recalled memories.
 *   4. A JUDGE model labels the reply CORRECT/WRONG against the gold
 *      answer (generous on wording, strict on facts and dates).
 *
 * Works with any OpenAI-compatible /chat/completions endpoint — an open
 * model on your own GPU (vLLM, Ollama, TGI, llama.cpp server) costs
 * nothing per call. Configure with env vars:
 *
 *   ANSWER_BASE_URL  e.g. http://gpu-box:8000/v1      (required)
 *   ANSWER_MODEL     e.g. Qwen/Qwen2.5-14B-Instruct   (required)
 *   ANSWER_API_KEY   optional
 *   JUDGE_BASE_URL / JUDGE_MODEL / JUDGE_API_KEY      default to ANSWER_*
 *   SMARAN_BASE_URL (default http://localhost:8787), SMARAN_API_KEY
 *
 * Flags: --limit=N conversations, --top-k=N (default 10), --skip-ingest
 * (reuse memories from a previous run against the same API),
 * --concurrency=N LLM requests in flight (default 4), --no-rerank.
 *
 * Writes .smaran/results/locomo-qa-<answer-model>.{md,json}; the JSON
 * keeps every question, recalled context, answer and verdict for audit.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs"

const arg = (name: string) =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]
const flag = (name: string) => process.argv.includes(`--${name}`)

const SMARAN = process.env.SMARAN_BASE_URL ?? "http://localhost:8787"
const SMARAN_KEY = process.env.SMARAN_API_KEY ?? "sk_local_dev"
const LIMIT = Number(arg("limit") ?? Number.POSITIVE_INFINITY)
const TOP_K = Number(arg("top-k") ?? 10)
const CONCURRENCY = Number(arg("concurrency") ?? 4)
const SKIP_INGEST = flag("skip-ingest")
const RERANK = !flag("no-rerank")

const answerCfg = {
	baseUrl: process.env.ANSWER_BASE_URL,
	model: process.env.ANSWER_MODEL,
	apiKey: process.env.ANSWER_API_KEY,
}
const judgeCfg = {
	baseUrl: process.env.JUDGE_BASE_URL ?? answerCfg.baseUrl,
	model: process.env.JUDGE_MODEL ?? answerCfg.model,
	apiKey: process.env.JUDGE_API_KEY ?? answerCfg.apiKey,
}
if (!answerCfg.baseUrl || !answerCfg.model) {
	console.error(
		"Set ANSWER_BASE_URL and ANSWER_MODEL (any OpenAI-compatible endpoint).",
	)
	process.exit(1)
}

const DATA_URL =
	"https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json"
const CACHE = ".smaran/datasets/locomo10.json"
const CATS: Record<number, string> = {
	1: "multi-hop",
	2: "temporal",
	3: "open-domain",
	4: "single-hop",
}

interface Turn {
	dia_id: string
	speaker: string
	text: string
	blip_caption?: string
}
interface QA {
	question: string
	answer?: string | number
	evidence: string[]
	category: number
}
interface Sample {
	sample_id: string
	conversation: Record<string, unknown>
	qa: QA[]
}

async function smaran(path: string, body: unknown): Promise<any> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${SMARAN}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${SMARAN_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		})
		if (res.status === 429 && attempt < 20) {
			await Bun.sleep(Number(res.headers.get("retry-after") ?? 1) * 1000)
			continue
		}
		if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
		return res.json()
	}
}

async function chat(
	cfg: { baseUrl?: string; model?: string; apiKey?: string },
	messages: Array<{ role: string; content: string }>,
	maxTokens: number,
): Promise<string> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(
			`${cfg.baseUrl!.replace(/\/$/, "")}/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
				},
				body: JSON.stringify({
					model: cfg.model,
					messages,
					temperature: 0,
					max_tokens: maxTokens,
				}),
			},
		)
		if ((res.status === 429 || res.status >= 500) && attempt < 6) {
			await Bun.sleep(1000 * 2 ** attempt)
			continue
		}
		if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`)
		const json = (await res.json()) as {
			choices: Array<{ message: { content: string | null } }>
		}
		return (json.choices[0]?.message.content ?? "").trim()
	}
}

const ANSWER_SYSTEM = `You answer questions about a long conversation between two people, using ONLY the memories provided. Each memory shows when it was said. Resolve relative dates ("yesterday", "last week") against that date. Answer in a short phrase — no explanation. If the memories don't contain the answer, say "unknown".`

const JUDGE_SYSTEM =
	"You grade answers to questions about a conversation. Compare the RESPONSE to the GOLD answer. Label CORRECT if the response conveys the same fact(s) as the gold answer — wording, order, extra detail and equivalent date formats are fine, but missing or different key facts are WRONG. For dates, the same day/month/year (or the same relative period) is CORRECT. Reply with exactly one word: CORRECT or WRONG."

async function pool<T, R>(
	items: T[],
	n: number,
	fn: (t: T, i: number) => Promise<R>,
): Promise<R[]> {
	const out = new Array<R>(items.length)
	let next = 0
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (next < items.length) {
				const i = next++
				out[i] = await fn(items[i]!, i)
			}
		}),
	)
	return out
}

if (!existsSync(CACHE)) {
	mkdirSync(".smaran/datasets", { recursive: true })
	writeFileSync(CACHE, await (await fetch(DATA_URL)).text())
}
const data = ((await Bun.file(CACHE).json()) as Sample[]).slice(0, LIMIT)
const health = (await (await fetch(`${SMARAN}/health`)).json()) as {
	store: string
	embedder: string
}
console.log(
	`LoCoMo QA → ${SMARAN} (store=${health.store}, embedder=${health.embedder}, rerank=${RERANK}, topK=${TOP_K})\n` +
		`answer=${answerCfg.model} @ ${answerCfg.baseUrl}  judge=${judgeCfg.model} @ ${judgeCfg.baseUrl}`,
)

if (!SKIP_INGEST) {
	for (const s of data) {
		const userId = `locomo_${s.sample_id}`
		const sessions = Object.keys(s.conversation)
			.filter((k) => /^session_\d+$/.test(k))
			.sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
		for (const k of sessions) {
			const date = String(s.conversation[`${k}_date_time`] ?? "")
			for (const t of s.conversation[k] as Turn[]) {
				const caption = t.blip_caption
					? ` [shares a photo: ${t.blip_caption}]`
					: ""
				await smaran("/v1/memories", {
					userId,
					sessionId: `${userId}_${k}`,
					text: `${t.speaker}: ${t.text}${caption}`,
					metadata: { diaId: t.dia_id, sessionDate: date },
				})
			}
		}
		console.log(`  ingested ${s.sample_id}`)
	}
}

type Row = {
	sample: string
	category: string
	question: string
	gold: string
	answer: string
	verdict: string
	context: string[]
}
const questions = data.flatMap((s) =>
	s.qa
		.filter((q) => CATS[q.category] && q.answer !== undefined)
		.map((q) => ({ s, q })),
)
let done = 0
const rows = await pool(
	questions,
	CONCURRENCY,
	async ({ s, q }): Promise<Row> => {
		const recall = await smaran("/v1/recall", {
			userId: `locomo_${s.sample_id}`,
			query: q.question,
			topK: TOP_K,
			rerank: RERANK,
		})
		const context = (
			recall.hits as Array<{
				memory: { text: string; metadata: { sessionDate?: string } }
			}>
		).map(
			(h) =>
				`[${h.memory.metadata?.sessionDate ?? "unknown date"}] ${h.memory.text}`,
		)
		const answer = await chat(
			answerCfg,
			[
				{ role: "system", content: ANSWER_SYSTEM },
				{
					role: "user",
					content: `Memories:\n${context.join("\n") || "(none)"}\n\nQuestion: ${q.question}`,
				},
			],
			64,
		)
		const raw = await chat(
			judgeCfg,
			[
				{ role: "system", content: JUDGE_SYSTEM },
				{
					role: "user",
					content: `QUESTION: ${q.question}\nGOLD: ${q.answer}\nRESPONSE: ${answer}`,
				},
			],
			4,
		)
		const verdict =
			/\bCORRECT\b/i.test(raw) && !/\bWRONG\b/i.test(raw) ? "CORRECT" : "WRONG"
		if (++done % 50 === 0) console.log(`  ${done}/${questions.length}`)
		return {
			sample: s.sample_id,
			category: CATS[q.category]!,
			question: q.question,
			gold: String(q.answer),
			answer,
			verdict,
			context,
		}
	},
)

const cats = [...Object.values(CATS), "ALL (cat 1-4)"]
const table = cats.map((c) => {
	const rs = c.startsWith("ALL") ? rows : rows.filter((r) => r.category === c)
	const ok = rs.filter((r) => r.verdict === "CORRECT").length
	return `| ${c} | ${rs.length} | ${rs.length ? ((100 * ok) / rs.length).toFixed(1) : "–"}% |`
})
const report = [
	`LoCoMo QA (LLM-as-judge). store=${health.store} embedder=${health.embedder} rerank=${RERANK} topK=${TOP_K}`,
	`answer model: ${answerCfg.model} · judge model: ${judgeCfg.model} · conversations: ${data.length}`,
	"",
	"| Category | Questions | Judge accuracy |",
	"|---|---|---|",
	...table,
].join("\n")
console.log(`\n${report}`)
mkdirSync(".smaran/results", { recursive: true })
const slug = String(answerCfg.model).replace(/[^\w.-]+/g, "_")
writeFileSync(`.smaran/results/locomo-qa-${slug}.md`, `${report}\n`)
writeFileSync(
	`.smaran/results/locomo-qa-${slug}.json`,
	JSON.stringify(rows, null, 2),
)
console.log(`\nwritten to .smaran/results/locomo-qa-${slug}.{md,json}`)
