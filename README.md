<div align="center">
  <img src=".github/assets/logo.png" width="360" alt="Smaran" />

  <h3>Voice-native memory infrastructure for AI agents</h3>

  <p>
    Sub-second recall path • Streaming ASR ingest • Hindi/English code-switching •
    <br />
    Adapters for every major LLM, agent framework, and voice platform.
  </p>

  <p>
    <a href="https://github.com/Ayushpani/smaran/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ayushpani/smaran/ci.yml?branch=main&label=CI&style=flat-square" alt="CI" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT license" /></a>
    <img src="https://img.shields.io/badge/runtime-Bun%20%7C%20Node-black.svg?style=flat-square" alt="Runtime" />
    <img src="https://img.shields.io/badge/monorepo-Turbo-red.svg?style=flat-square" alt="Turbo" />
    <a href="https://github.com/Ayushpani/smaran/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs welcome" /></a>
  </p>
</div>

---

## Try it in 30 seconds

```bash
git clone https://github.com/Ayushpani/smaran && cd smaran
bun install
bun run try
```

Live memory API on `http://localhost:8787`. No database, no API keys, no setup. Sandbox data disappears when the process exits.

```bash
# Save
curl http://localhost:8787/v1/memories \
  -H "Authorization: Bearer sk_local_dev" \
  -H "Content-Type: application/json" \
  -d '{"text":"I prefer window seats. My daughter loves elephants.","userId":"u1","sessionId":"s1"}'

# Recall
curl http://localhost:8787/v1/recall \
  -H "Authorization: Bearer sk_local_dev" \
  -H "Content-Type: application/json" \
  -d '{"query":"what does my kid like","topK":3}'
```

---

## What is Smaran

Smaran is a self-hosted memory layer for AI agents built specifically around the constraints of **voice**: sub-second recall under a live call, ASR-noise cleanup, Hindi/English code-switching, per-turn observability, and barge-in rollback. It ships with adapters for every mainstream LLM SDK, every popular agent framework, and every major voice platform, so wiring it into an existing agent is usually one import.

Under the hood it's a small provider-agnostic core (`@repo/core`) with a Postgres+pgvector store, sitting behind a Hono HTTP API, an MCP server, and an optional Cloudflare Worker edge tier. Every adapter is a thin translation layer — no client wrapping, no monkey-patching, one interface all the way down.

---

## Deploy anywhere

Fully self-hosted. Pick your cloud (all offer free tiers big enough for early usage):

<p>
  <a href="https://railway.app/new/template?template=https%3A%2F%2Fgithub.com%2FAyushpani%2Fsmaran&envs=DATABASE_URL"><img src="https://railway.app/button.svg" alt="Deploy on Railway" /></a>
  <a href="https://render.com/deploy?repo=https://github.com/Ayushpani/smaran"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" /></a>
  <a href="https://fly.io/docs/apps/launch/"><img src="https://img.shields.io/badge/Deploy%20on-Fly.io-8B5CF6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEyIDJMMiAxMmwxMCAxMCA5LjUtOS41WiIvPjwvc3ZnPg==" alt="Deploy on Fly.io" /></a>
</p>

The API needs one env var (`DATABASE_URL`) — a Supabase free-tier Postgres works out of the box. See [`apps/api/README.md`](apps/api/README.md).

---

## What Smaran ships

### Core

| Package | Purpose |
| --- | --- |
| [`@repo/core`](packages/core) | Provider-agnostic memory engine + shared adapter contract. Ships `HashEmbedder`, `HeuristicConsolidator`, and `InMemoryStore` so it runs without any external dependency. |
| [`@repo/db`](packages/db) | Drizzle schema + `MemoryStore` for Postgres+pgvector. Multi-hop graph store. Idempotent migrations. |
| [`@repo/voice`](packages/voice) | Live-call primitives: `StreamingSession`, `HotCache` (TTL LRU), `scrubAsrText`, barge-in `abortTurn`/`rollbackLastTurn`. |
| [`@repo/language`](packages/language) | Script/language detection across Latin + 8 Indian scripts, Hindi/Hinglish filler removal, heuristic NER, session-scoped coreference. |
| [`@repo/data-pipeline`](packages/data-pipeline) | PII scrubbing (Aadhaar/PAN/GSTIN/UPI) + training-pair extraction for future distilled models. |
| [`@repo/models`](packages/models) | Reranker contract with heuristic + HTTP + WASM slots. |
| [`@smaranai/sdk-ts`](packages/sdk-ts) | Zero-dependency TypeScript client. |

### LLM & agent-framework adapters

| Package | Coverage |
| --- | --- |
| [`@smaranai/adapter-anthropic`](packages/adapter-anthropic) | Anthropic Messages + Claude Agent SDK |
| [`@smaranai/adapter-openai`](packages/adapter-openai) | OpenAI Chat/Responses/Agents/Codex + Groq/Together/DeepSeek/xAI/Fireworks/Ollama/LM Studio/vLLM |
| [`@smaranai/adapter-google`](packages/adapter-google) | Google Gemini + Agent Kit |
| [`@smaranai/adapter-vercel-ai`](packages/adapter-vercel-ai) | Vercel AI SDK |
| [`@smaranai/adapter-langgraph`](packages/adapter-langgraph) | LangGraph.js |
| [`@smaranai/adapter-mastra`](packages/adapter-mastra) | Mastra |

Every adapter exposes both **model-driven tools** (the model calls `memory_save` / `memory_recall` itself) and **silent context injection** (`withRecalledContext` prepends relevant memories to the system prompt). Compose both on the same call.

### Voice-platform adapters

| Package | Coverage |
| --- | --- |
| [`@smaranai/adapter-vapi`](packages/adapter-vapi) | Vapi server-URL webhook (functions + transcripts) |
| [`@smaranai/adapter-livekit`](packages/adapter-livekit) | LiveKit Agents (Pipecat by shape) |

### Applications

| App | Purpose |
| --- | --- |
| [`apps/api`](apps/api) | The memory API. REST + SSE. Sandbox mode (`STORE=memory`) or persistent (`STORE=supabase`). |
| [`apps/mcp`](apps/mcp) | MCP server — plugs into Claude Desktop / Claude Code / Cursor / Windsurf. |
| [`apps/edge-recall`](apps/edge-recall) | Cloudflare Worker: KV hot cache tier in front of the origin. |
| [`apps/starter-vapi`](apps/starter-vapi) | ~90-line runnable Vapi voice-agent-with-memory template. |
| [`apps/reranker-worker`](apps/reranker-worker) | BAAI cross-encoder as a CF Worker. |

Full endpoint reference: [`DOCS.md`](DOCS.md).

---

## Two integration patterns, per adapter

```ts
// Anthropic Claude — model decides when to save/recall
import Anthropic from "@anthropic-ai/sdk"
import { handleToolUse, memoryTools, withRecalledContext } from "@smaranai/adapter-anthropic"

const res = await anthropic.messages.create({
  model: "claude-…",
  system: (await withRecalledContext(memory, { messages }, scope)).system,
  tools: memoryTools(),
  messages,
})
```

```ts
// Vapi voice agent — memory follows the caller across sessions
import { handleVapiEvent, memoryFunctions } from "@smaranai/adapter-vapi"

app.post("/vapi", async (c) => {
  const result = await handleVapiEvent(await c.req.json().then(b => b.message), {
    memory, session, sessionId: callId, userId
  })
  if (result.response) return c.json(result.response)
  return c.body(null, 204)
})
```

More examples in each adapter's README.

---

## Current status — honest read

Smaran is a working codebase, not yet a validated product. Being explicit about what's proven vs. what's still on the roadmap:

**Working end-to-end today** (verified in a live sandbox):
- Save, recall, forget, streaming ingest, DPDP endpoints, graph traverse
- Recall = 4-channel reciprocal rank fusion (dense vector + keyword + entity graph + recency/frequency decay), not plain vector search
- Bi-temporal memory: point-in-time recall (`asOf`), auto-supersession of corrected facts across sessions
- Beta-Binomial belief tracking — confidence strengthens with corroborating evidence instead of a flat scalar
- Per-user consolidated profile (`/v1/profile`) — evidence-gated summary, no LLM call in its default form
- Provider adapters for Anthropic, OpenAI, Gemini, Vercel AI SDK, LangGraph, Mastra, Vapi, LiveKit, MCP
- Hindi/Hinglish detection + filler stripping, entity extraction, session coreference
- Barge-in rollback, hot-cache tier, speculative prefetch
- Per-tenant reranker AND embedder registry with atomic activation
- Cloudflare Worker edge tier
- Sandbox mode with no external dependencies

**Shipped but not proven yet**:
- Recall quality — the default `HashEmbedder` is a deterministic stub; real embeddings work via `EMBEDDER=openai` (any `/v1/embeddings` host, including free-tier Ollama), but published benchmark numbers do not yet exist.
- Latency — architecturally supported (sub-200ms with in-region hosting), not yet measured on real voice-agent traffic.
- Semantic (embedding-based) self-correction — a language-agnostic replacement for the current English-only retraction cue list exists (`applySelfCorrectionSemantic`) but regressed under the sandbox's stub embedder in testing, so it isn't wired into the live route yet. Needs validation against a real embedder first.

**On the roadmap** (planned, not yet code):
- Distilled voice-tuned embedder + reranker (needs collected call data to train)
- Public playground UI
- Managed hosted tier + pricing

No production users, no funding round, no case studies. If you're reading this and want to be the first design partner, [open an issue](https://github.com/Ayushpani/smaran/issues/new).

---

## Development

```bash
bun install
bun run try                          # sandbox API on :8787
bun run check-types                  # tsc across every package
bunx biome check --write             # format + lint
bun --filter '@repo/db' db:migrate   # migrate a Supabase Postgres
```

CI runs type-check + Biome on every PR — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Architecture at a glance

```
                   ┌──────────────────────────────────────┐
     LLM caller ──▶│  adapter-{anthropic,openai,google,   │
                   │  vercel-ai,langgraph,mastra,vapi,    │
                   │  livekit}                            │
                   └───────────────┬──────────────────────┘
                                   │  MemoryClient (shared)
                                   ▼
                   ┌──────────────────────────────────────┐
                   │  @smaranai/sdk-ts  ──▶  HTTP + SSE       │
                   └───────────────┬──────────────────────┘
                                   ▼
                       ┌───────────────────────┐
                       │  apps/api  (Hono)     │
                       │  auth · routes ·      │
                       │  model resolver       │
                       └────────┬──────────────┘
                                │  MemoryStore
                     ┌──────────┴──────────┐
                     ▼                     ▼
             InMemoryStore         Postgres + pgvector
             (STORE=memory)        (STORE=supabase)
```

`apps/edge-recall` sits in front of `apps/api` when deployed to Cloudflare, terminating repeat recalls at the edge with a KV hot cache.

---

## Contributing

PRs welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). Every phase of the build is a separate commit on the branch and every PR runs the CI. Adapters, examples, and language coverage improvements are the highest-leverage places to help.

---

## License

MIT — [`LICENSE`](LICENSE). Use it for anything, commercial or personal, no strings attached.
