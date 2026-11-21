# Smaran — documentation index

Voice-native memory infrastructure. Phases 1–6 are shipped in this
repo. This is the quick-navigation index — every package listed below
has its own README with a runnable example.

## Playbook & implementation plan

- [Voice-Memory Playbook](https://claude.ai/code/artifact/7bdab820-9586-45c2-a1af-73ab5622636e) — strategy, moat stack, GTM.
- [Implementation Plan](https://claude.ai/code/artifact/54275eeb-c4b3-4c03-b509-099e9d86dea6) — the eight-phase engineering roadmap.

## Core

| Package                                                     | What it is                                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`@repo/core`](./packages/core/README.md)                   | Provider-agnostic memory engine. Frozen `MemoryCore` / `MemoryStore` / `Embedder` / `Consolidator` contracts every adapter binds to. |
| [`@repo/db`](./packages/db/README.md)                       | Drizzle schema + Supabase-backed `MemoryStore`. Graph store in `graph.ts`.                                                           |
| [`@smaranai/sdk-ts`](./packages/sdk-ts/README.md)           | Zero-dep TypeScript client for the API.                                                                                              |
| [`@repo/voice`](./packages/voice/README.md)                 | HotCache, ASR scrubber, StreamingSession, barge-in rollback.                                                                         |
| [`@repo/language`](./packages/language/README.md)           | Script/language detection, Hindi/Hinglish filler removal, heuristic NER, session coreference.                                        |
| [`@repo/data-pipeline`](./packages/data-pipeline/README.md) | PII scrubbing + training-pair extraction — feeds Phase 6 distilled-model training.                                                   |
| [`@repo/models`](./packages/models/README.md)               | Reranker contract + WASM runtime placeholder for the future voice-tuned distilled models.                                            |

## LLM adapters — model-driven tools + silent context

| Package                                                                 | Providers covered                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`@smaranai/adapter-anthropic`](./packages/adapter-anthropic/README.md) | Anthropic Messages API — tools, `tool_use` handling, recalled-memory system prompt. Tested with `@anthropic-ai/sdk` 1.x.           |
| [`@smaranai/adapter-openai`](./packages/adapter-openai/README.md)       | OpenAI Chat Completions and every compatible endpoint (Groq, Together, DeepSeek, Ollama, vLLM…). Tested with `openai` 7.x.         |
| [`@smaranai/adapter-google`](./packages/adapter-google/README.md)       | Google Gemini function calling + `systemInstruction`. Tested with `@google/genai` 3.x.                                             |
| [`@smaranai/adapter-vercel-ai`](./packages/adapter-vercel-ai/README.md) | Vercel AI SDK `tool()` set for `generateText` / `streamText` / agents. Tested with `ai` 7.x.                                       |
| [`@smaranai/adapter-langgraph`](./packages/adapter-langgraph/README.md) | LangGraph.js / LangChain.js tools (`ToolNode`, `createReactAgent`) + `SystemMessage` injection. Tested with `@langchain/core` 1.x. |
| [`@smaranai/adapter-mastra`](./packages/adapter-mastra/README.md)       | Mastra `createTool` tools for `Agent`. Tested with `@mastra/core` 1.x.                                                             |

## Voice-platform adapters

| Package                                                             | What it handles                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@smaranai/adapter-vapi`](./packages/adapter-vapi/README.md)       | Vapi server-URL webhook. Function calls → memory ops. Transcripts → StreamingSession.                                                       |
| [`@smaranai/adapter-livekit`](./packages/adapter-livekit/README.md) | LiveKit Agents (works for Pipecat too). Four hooks: `onPartialTranscript`, `onFinalTranscript`, `handleFunctionCall`, `buildContextPrefix`. |

## Applications

| App                                                  | What it is                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`apps/api`](./apps/api/README.md)                   | Self-hosted memory API. Hono over Bun. Bearer auth, REST + SSE, DPDP endpoints, graph traverse, /v1/models registry. |
| [`apps/mcp`](./apps/mcp/)                            | MCP server — every MCP client (Claude Desktop, Claude Code, Cursor, Windsurf) gets memory.                           |
| [`apps/edge-recall`](./apps/edge-recall/README.md)   | Cloudflare Worker: KV hot cache tier + edge rerank in front of the origin.                                           |
| [`apps/starter-vapi`](./apps/starter-vapi/README.md) | ~90-line runnable Vapi voice-agent template with memory.                                                             |
| [`apps/reranker-worker`](./apps/reranker-worker/)    | Cross-encoder reranker as a Cloudflare Worker.                                                                       |

## Public API surface (`apps/api`)

Every route is tenant-scoped by the API-key middleware.

| Verb   | Path                         | Purpose                                                                                             |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/health`                    | Liveness + configured embedder.                                                                     |
| POST   | `/v1/memories`               | Save. Language-aware — records `originalText`, `codeSwitched`, `primaryLanguage`, `fillersRemoved`. |
| DELETE | `/v1/memories/:id`           | Forget one memory.                                                                                  |
| POST   | `/v1/recall`                 | Semantic recall + optional rerank.                                                                  |
| POST   | `/v1/ingest/partial`         | Append token-level partial transcript.                                                              |
| POST   | `/v1/ingest/commit`          | Finalize the current turn, scrub, save.                                                             |
| GET    | `/v1/sessions/:id/subscribe` | SSE memory events.                                                                                  |
| POST   | `/v1/graph/entities`         | Upsert entities.                                                                                    |
| POST   | `/v1/graph/entities/extract` | Extract + persist entities from raw text.                                                           |
| POST   | `/v1/graph/relations`        | Add relations.                                                                                      |
| POST   | `/v1/graph/traverse`         | Multi-hop CTE walk, returns entities + hydrated memories.                                           |
| POST   | `/v1/models`                 | Register a per-tenant embedder/reranker candidate.                                                  |
| GET    | `/v1/models`                 | List tenant's models (+ platform defaults).                                                         |
| POST   | `/v1/models/:id/activate`    | Activate one candidate atomically.                                                                  |
| POST   | `/v1/dpdp/right-to-forget`   | Cascade-delete a user's data.                                                                       |
| GET    | `/v1/dpdp/export`            | Data portability.                                                                                   |
| POST   | `/v1/dpdp/consent`           | Consent record.                                                                                     |

## Getting started, in three commands

```bash
# 1. Migrate
DATABASE_URL='postgresql://...' bun --filter '@repo/db' db:migrate

# 2. Seed a tenant + API key
DATABASE_URL='postgresql://...' bun --filter '@repo/db' db:seed dev

# 3. Run the API
bun --filter '@repo/api' dev
```

Full setup in [`apps/api/README.md`](./apps/api/README.md).
