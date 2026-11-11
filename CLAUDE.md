# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Smaran is a self-hosted, voice-first memory API for AI agents. A Bun + Hono
HTTP API (`apps/api`) wraps a provider-agnostic memory engine
(`packages/core`) backed by either an in-process store (sandbox) or
Postgres + pgvector (`packages/db`).

## Layout

- `apps/api` — the HTTP API. `/v1/memories`, `/v1/recall`, `/v1/ingest`,
  `/v1/sessions/:id/subscribe` (SSE). Persistent mode adds `/v1/graph`,
  `/v1/models`, `/v1/profile`, `/v1/dpdp`. Auth is a Bearer API key
  (SHA-256 hashed in `api_keys`); sandbox mode uses one fixed key.
- `apps/mcp` — MCP server (Cloudflare Durable Object) proxying to `/v1`.
- `apps/edge-recall`, `apps/reranker-worker` — optional Cloudflare Workers.
- `apps/site` — marketing site and docs (`apps/site/content/docs`).
- `apps/starter-vapi`, `apps/voice-agent-livekit` — runnable voice demos.
- `packages/core` — save/recall engine: sentence segmentation, kind
  classification, slot-revision detection, 4-channel RRF recall (dense,
  keyword, graph, temporal decay), bi-temporal validity, session event bus.
- `packages/db` — Drizzle schema, SQL migrations, Postgres store, graph store.
- `packages/language` — tokenization, script detection, self-correction,
  Hinglish normalization, entity extraction.
- `packages/voice` — ASR scrubber, hot cache, `StreamingSession`.
- `packages/models` — reranker interface + heuristic/HTTP implementations.
- `packages/adapter-*` — thin translations of the shared memory tool spec
  into each LLM / agent / voice framework's native shape.
- `packages/sdk-ts`, `packages/sdk-python` — clients for `/v1`.
- `packages/*-python` — Python framework integrations built on `sdk-python`.

## Commands

- `bun run try` — sandbox API on :8787, key `sk_local_dev`, no DB needed.
- `bun run test` — engine, API and MCP test suites.
- `bun run check-types` — TypeScript checks.
- `bun run format-lint` — Biome format + lint.
- `bun run scripts/benchmark-voice-turns.ts` — voice-turn accuracy suite
  against a running API.
- `DATABASE_URL=... bun --filter @repo/db db:migrate` — apply migrations.

## Conventions

- Every write path goes through `apps/api/src/prepare.ts` so text and voice
  store identical text for the same utterance.
- Every store query is tenant-scoped; never add one that isn't.
- Do not publish latency or accuracy numbers that are not reproducible from
  a script in this repo (see `RESULTS.md`).
