# Contributing to Smaran

Thanks for wanting to help build the memory layer voice agents actually
need. This is a working codebase moving fast — every improvement lands
on `main` and every PR runs CI.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Git

## Get the sandbox running

```bash
git clone https://github.com/Ayushpani/smaran
cd smaran
bun install
bun run try
```

That runs the API in in-memory mode on `http://localhost:8787` with a
fixed key (`sk_local_dev`). Zero setup, zero external services. Perfect
for hacking on adapters, language logic, or the recall path.

For persistent-mode work (Postgres + pgvector), see
[`apps/api/README.md`](apps/api/README.md).

## Repository shape

```
smaran/
├── apps/
│   ├── api/                Hono memory API (sandbox or Supabase)
│   ├── mcp/                MCP server for Claude Desktop / Cursor / Windsurf
│   ├── edge-recall/        Cloudflare Worker — KV hot cache tier
│   ├── starter-vapi/       Runnable Vapi voice-agent-with-memory template
│   ├── reranker-worker/    BAAI cross-encoder as a CF Worker
│   ├── site/               Marketing site + docs (Next.js)
│   └── voice-agent-livekit/ Python LiveKit voice agent demo
├── packages/
│   ├── core/               Provider-agnostic memory engine + adapter contract
│   ├── db/                 Drizzle schema + Postgres store + graph store
│   ├── voice/              StreamingSession, HotCache, ASR scrubber, barge-in
│   ├── language/           Script detection, Hinglish, NER, coreference
│   ├── data-pipeline/      PII scrubber + training-pair extractor
│   ├── models/             Reranker + WASM runtime interfaces
│   ├── sdk-ts/             Zero-dep TypeScript client
│   ├── cli/                smaran-cli — try / init
│   ├── adapter-anthropic/  Anthropic Messages + Agent SDK
│   ├── adapter-openai/     OpenAI + Codex + every OpenAI-compat provider
│   ├── adapter-google/     Gemini + Agent Kit
│   ├── adapter-vercel-ai/  Vercel AI SDK
│   ├── adapter-langgraph/  LangGraph.js
│   ├── adapter-mastra/     Mastra
│   ├── adapter-vapi/       Vapi server-URL webhook
│   └── adapter-livekit/    LiveKit Agents (Pipecat by shape)
└── DOCS.md                 Full public API reference
```

## Development workflow

```bash
bun run try                # Sandbox API on :8787
bun run check-types        # tsc across every package
bunx biome check --write   # Format + lint

# Persistent-mode workflow
DATABASE_URL='...' bun --filter '@repo/db' db:migrate
DATABASE_URL='...' bun --filter '@repo/db' db:seed dev
bun --filter '@repo/api' dev
```

CI (`.github/workflows/ci.yml`) runs on every PR:
1. `bun install --frozen-lockfile`
2. `bunx turbo run check-types`
3. `bunx biome ci --changed --since=origin/main`

If either fails, the PR is blocked. Run both locally before pushing.

## Where to help — ranked by leverage

**Highest impact** (helps everyone downstream):
- Fill in more Hinglish markers / Devanagari coverage in `packages/language`
- Add adapters for frameworks not yet covered (CrewAI, AutoGen, Semantic Kernel, LlamaIndex, Bolna, Retell)
- A real benchmark dataset — a CI-integrated recall benchmark on public voice-agent data is the single most valuable contribution right now

**Medium impact**:
- Voice-platform SDK plugins (Retell, Bland, Pipecat proper)
- Language coverage — more code-switching pairs, more script detection edge cases
- Custom rerankers (`@repo/models`)

**Also welcome**:
- Docs improvements, README clarifications, adapter README examples
- Bug fixes with a reproducing test

## Pull request expectations

- **Small, focused PRs.** One concern per PR beats one giant PR every time.
- **CI green before requesting review.** Type-check + Biome must pass.
- **Commit message format**: `<area>: <what changed>` — e.g. `adapter-openai: handle streaming tool_call deltas`.
- **Honest description**: what actually changed, what you tested, what you deliberately didn't touch.
- Do not include marketing claims, benchmark numbers, or feature descriptions in code comments — reserve those for release notes.

## Coding standards

- **TypeScript everywhere**, `strict: true`, no `any` unless you comment why.
- **Structural types** in adapters — never import provider SDKs at runtime, only the types you need.
- **Never widen the diff.** Auto-formatters that touch unrelated files must be scoped to your changed files only.
- **No feature flags for hypothetical futures.** If a code path isn't reachable, it doesn't ship.

## License

MIT — [`LICENSE`](LICENSE). By contributing, you agree that your code is
also MIT-licensed.

## Getting help

- Open a [Discussion](https://github.com/Ayushpani/smaran/discussions) for design questions
- Open an [Issue](https://github.com/Ayushpani/smaran/issues) for bugs / feature requests
- Read [`DOCS.md`](DOCS.md) for the full endpoint reference
