# Smaran — measured results

Every number quoted anywhere on the site, README or docs must resolve to a run in this file, reproducible from a script in this repo. If it isn't here, it isn't real.

## Current engine

**Hardware:** 4 vCPU Intel Xeon @ 2.10GHz, 15 GB RAM, no GPU, single process, API and client on the same machine (no network hop).
**Config:** `STORE=memory`, `EMBEDDER=local` (Xenova/multilingual-e5-small, q8, CPU) unless noted.

### LoCoMo retrieval (public long-term memory benchmark)

`scripts/benchmark-locomo.ts` saves every dialogue turn of the 10 LoCoMo conversations (5,882 turns) through `POST /v1/memories`, then asks every question through `POST /v1/recall` with `topK=10`. A question is a hit@k if one of its labelled evidence turns is in the top k; "full evidence" needs all of them. Category 5 (unanswerable by design) is excluded. This measures retrieval only, not end-to-end answer accuracy (that needs an LLM judge).

| Category          | Questions | Hit@1     | Hit@5     | Hit@10    | Full evidence@10 | MRR@10    |
| ----------------- | --------- | --------- | --------- | --------- | ---------------- | --------- |
| multi-hop         | 282       | 26.6%     | 54.3%     | 64.5%     | 18.4%            | 0.387     |
| temporal          | 321       | 48.9%     | 71.0%     | 76.9%     | 71.0%            | 0.586     |
| open-domain       | 92        | 19.6%     | 37.0%     | 43.5%     | 26.1%            | 0.266     |
| single-hop        | 841       | 39.7%     | 64.4%     | 74.4%     | 71.7%            | 0.504     |
| **All (cat 1-4)** | **1536**  | **38.0%** | **62.3%** | **71.3%** | **59.0%**        | **0.485** |

Save p50 12.9 ms / p95 24.9 ms (n=5882). Recall p50 14.8 ms / p95 22.3 ms (n=1536).

**Same benchmark on Postgres** (`STORE=supabase`: local PostgreSQL 16 + pgvector 0.6 on the same machine, migrations 0000–0004): Hit@1 37.4%, Hit@5 62.2%, **Hit@10 71.5%**, full evidence 59.1%, MRR 0.481. **Save p50 22.9 ms / p95 37.8 ms; recall p50 29.9 ms / p95 42.6 ms.** Real deployments add the network round trip to the database.

Postgres fixes behind those numbers (before → after, full run): keyword search OR-ed and IDF-weighted in a single lexeme join (it previously required every query word to match, and the first IDF version re-parsed queries per row); dense search made exact within the user's scope instead of HNSW post-filtering; the unused HNSW index dropped; recall no longer waits for its access-count write. Save p95 299 → 38 ms, recall p95 108 → 43 ms.

Same in-memory run with `EMBEDDER=hash` (no semantic model, keyword channel only effectively): Hit@1 4.6%, Hit@10 52.3%, MRR 0.178.

How the engine got here, each step measured on conversation 1 (150 questions, hit@1 / hit@10):

| Change                                                                                    | Hit@1 | Hit@10 |
| ----------------------------------------------------------------------------------------- | ----- | ------ |
| Starting point: recency as an equal RRF vote, overlap keyword scoring, sentence splitting | 9.9%  | 45.4%  |
| Recency demoted to a tie-breaker, IDF-weighted keyword scoring                            | 25.0% | 60.5%  |
| Messages kept whole (only text > 500 chars is chunked)                                    | 31.6% | 68.4%  |

Reproduce (Postgres: set `STORE=supabase DATABASE_URL=…`, run `bun --filter @repo/db db:migrate` and `db:seed`, pass the seeded key as `SMARAN_API_KEY`):

```bash
bun run try                              # terminal 1 (fresh process — no prior data)
bun run scripts/benchmark-locomo.ts      # terminal 2
```

### Voice-turn suite

`scripts/benchmark-voice-turns.ts`, 7 cases (self-correction, Hinglish, confirmation questions, refinement across turns): **7/7**. Save p50 5.2 ms, recall p50 4.0 ms.

---

## Historical runs (previous engine — do not quote)

The runs below predate the current engine (recall fusion, keyword scoring, chunking and the embedder all changed). The audio suite's `scripts/audio-samples/` was never committed, so those runs can't be reproduced from this repo.

### Historical methodology

Two suites already in the repo:

- `scripts/benchmark-voice-turns.ts` — 7 realistic voice-turn transcripts through `POST /v1/memories` then `POST /v1/recall`. Asserts `mustContain` / `mustNotContain` on recall output. Reports save + recall p50/p95.
- `scripts/benchmark-audio.ts` — real audio files (`scripts/audio-samples/*.wav`) through `scripts/transcribe.py` (Whisper) → `POST /v1/memories` → `POST /v1/recall`. Reports ASR + save + recall p50/p95.

Each is run against four **config combinations** so the numbers can be attributed to the right layer:

| Run | Store      | Embedder                        | Purpose                                       |
| --- | ---------- | ------------------------------- | --------------------------------------------- |
| A   | `memory`   | `hash`                          | sandbox baseline — isolates pipeline overhead |
| B   | `memory`   | `openai:text-embedding-3-small` | isolates embedder network cost                |
| C   | `supabase` | `hash`                          | isolates DB round-trip cost                   |
| D   | `supabase` | `openai:text-embedding-3-small` | **production shape — the one that matters**   |

Reproduce locally:

```bash
# Run A — sandbox baseline (already published)
STORE=memory EMBEDDER=hash SANDBOX_API_KEY=sk_local_dev bun run apps/api/src/index.ts &
bun run scripts/benchmark-voice-turns.ts
bun run scripts/benchmark-audio.ts scripts/audio-samples

# Run D — real production shape
STORE=supabase EMBEDDER=openai \
  DATABASE_URL="postgresql://..." \
  OPENAI_API_KEY="sk-..." \
  OPENAI_EMBED_MODEL="text-embedding-3-small" \
  bun run apps/api/src/index.ts &
bun run scripts/benchmark-voice-turns.ts
bun run scripts/benchmark-audio.ts scripts/audio-samples
```

---

### Run A — sandbox baseline

- **Store**: `memory` (InMemoryStore, ephemeral)
- **Embedder**: `hash` (HashEmbedder — deterministic, 0ms compute)
- **Hardware**: dev container, unspecified — see caveat below
- **Region**: local, no network hop
- **Commit**: `c033035` — post RRF fusion + bi-temporal + belief tracking
- **Timestamp**: 2026-08-31

**What changed since the original Run A**: recall is no longer plain
cosine top-K. It's 4-channel reciprocal rank fusion (dense + keyword +
graph + temporal decay) plus a Beta-Binomial confidence multiplier —
see the architecture section below. Numbers dropped slightly rather
than rising because the sandbox's `InMemoryStore` keyword/decay
channels are cheap JS-side computation, not a bottleneck at this scale;
don't read the small delta as a real regional/hardware signal, only the
relative "still sub-2ms" fact is meaningful here.

### Voice-turn suite (7 cases)

- **Accuracy**: 7/7 pass
- **Save**: p50 = **1.3 ms** · p95 = 1.6 ms · N = 8
- **Recall**: p50 = **1.4 ms** · p95 = 3.5 ms · N = 7

### Audio suite (6 cases)

Whisper-tiny on CPU — not rerun with this commit, numbers below are
from the original Run A and predate the RRF/bi-temporal work. Flagged
`[STALE]` rather than silently carried forward as current.

- **Accuracy [STALE]**: 3/7 (ASR mishearings, not memory-layer failures — see [transcript-preservation caveat](#interpreting-the-audio-accuracy-numbers))
- **ASR [STALE]**: p50 = 1373 ms · p95 = 1596 ms · N = 7 (whisper-tiny CPU)
- **Save [STALE]**: p50 = 10.7 ms · p95 = 13.9 ms · N = 7
- **Recall [STALE]**: p50 = 2.6 ms · p95 = 3.1 ms · N = 7

---

### Run B — embedder isolation

- **Store**: `memory`
- **Embedder**: `openai:text-embedding-3-small`
- **Hardware**: [FILL IN]
- **Region**: local + OpenAI API (typically us-east)
- **Commit**: [FILL IN]
- **Timestamp**: [FILL IN]

### Voice-turn suite

- **Accuracy**: [FILL IN]
- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

### Audio suite

Same asr numbers as Run A (ASR is upstream).

- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

---

### Run C — DB isolation

- **Store**: `supabase` (Postgres + pgvector, HNSW index)
- **Embedder**: `hash`
- **Hardware**: Windows dev machine (Ayushpani laptop)
- **Region**: Supabase Postgres accessed via **Tokyo pooler**
  (`aws-0-ap-northeast-1.pooler.supabase.com:6543`) from India — see
  the regional caveat below.
- **Commit**: `6d9b4bb` — Phase 8.3.2 (dev:supabase script)
- **Timestamp**: 2026-08-29

### Voice-turn suite

- **Accuracy**: 7/7 pass
- **Save**: p50 = **816.4 ms** · p95 = 921.8 ms · N = 8
- **Recall**: p50 = **716.6 ms** · p95 = 818.0 ms · N = 7

### Audio suite

Pending — script broke on missing Python on PATH (`transcribe.py exited 49`).
Will populate on next run with `$env:PYTHON = "python"` set.

### Regional latency caveat — read this before quoting the numbers

The 800ms Save / 700ms Recall figures above are **dominated by network
round-trip time between India (where the API + benchmark ran) and Tokyo
(where the Supabase pooler lives).** Each save is roughly:

```
localhost API  → Tokyo pooler        (~180 ms one-way)
Tokyo pooler   → Postgres primary    (~5 ms)
   pgvector write + HNSW touch       (~10-20 ms)
Postgres       → pooler → localhost  (~180 ms return)
   × ~2 round trips per save         (insert + embedding row)
```

So the ~800ms is roughly `4 × 200ms network + ~20ms real DB work`. The DB
itself is fast; the pooler geography is not.

**What this means for the site's headline numbers:**

- The current landing quotes 10.7ms Save / 2.6ms Recall from Run A
  (in-process sandbox). That's the pipeline overhead — a real number for
  what Smaran's own code costs.
- Run C shows what happens when you add a **cross-ocean** Supabase hop
  on top. Not what production would look like — production co-locates
  the API and the DB in the same region.
- For an honest production number, we'd need to run the API from a Tokyo
  region (or move the DB to Mumbai). Both are one-config-change away.

**The takeaway to publish**: pipeline overhead is single-digit ms; real
in-region DB adds ~10-30ms; cross-ocean adds ~500-800ms and is a
deployment mistake, not a Smaran number.

---

### Run D — production shape (the one that matters)

- **Store**: `supabase`
- **Embedder**: `openai:text-embedding-3-small`
- **Hardware**: [FILL IN]
- **Region**: Supabase `ap-south-1` via Tokyo pooler; OpenAI us-east
- **Commit**: [FILL IN]
- **Timestamp**: [FILL IN]

### Voice-turn suite

- **Accuracy**: [FILL IN]
- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

### Audio suite

- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

---

### Interpreting the audio accuracy numbers

The audio suite's accuracy is dominated by ASR quality, not memory-layer accuracy. Whisper-tiny mishears `987654321` as `9-8-7-6-5-4-3-2-1`, `Ayushpani` as `Aayush Pani`, `bandra` as `Bhandra`. Smaran saves what it's given; the memory layer's job is to preserve and retrieve that value, not to correct ASR. Every "fail" in the audio suite is an ASR miss, not a Smaran failure.

The transcript-suite accuracy (Run A's voice-turn suite) is the honest memory-layer number: **7/7 on realistic voice-turn corrections**.
