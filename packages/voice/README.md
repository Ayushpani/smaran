# `@repo/voice`

Voice-pipeline primitives layered on top of the `MemoryClient` contract from
`@repo/core`. Nothing here alters the frozen core interface — this package
composes it into a live-call shape.

## What's inside

- **`HotCache`** — Tier-1 LRU with TTL, keyed by `(sessionId, normalized query)`. Sub-millisecond recall for repeated within-session queries.
- **`scrubAsrText`** — Regex-driven filler / disfluency / false-start cleanup. Deliberately narrow; Phase 4 replaces with a distilled LM.
- **`isSubstantive`** — Filters "um.", "ok ok" and other non-content transcripts before they hit the store.
- **`StreamingSession`** — the whole voice-turn lifecycle. Accepts token-level partial transcripts, batches until commit, scrubs, fires `save` fire-and-forget so the caller is never blocked, and answers recall through the hot cache with a fall-through to the underlying client.
- **Speculative prefetch** — `session.prefetch([...])` warms the cache with predicted next-turn queries before the agent asks.

## Sketch

```ts
import { Smaran } from "@smaranai/sdk-ts"
import { HotCache, StreamingSession } from "@repo/voice"

const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })
const cache = new HotCache({ ttlMs: 60_000 })

const session = new StreamingSession({
	sessionId: "call_xyz",
	userId: "u_123",
	client: memory,
	cache,
})

// From your ASR provider (Deepgram, Whisper, Sarvam, …):
onPartial((text) => session.appendPartial(text))
onFinal(() => session.commitTurn())

// From your agent, on every turn:
const { hits, tier, latencyMs } = await session.recall(
	"what did they book last time?",
)
```

`tier === "hot"` on a cache hit, `"session"` otherwise. Latency numbers are
the ground truth for the sub-200ms claim in the implementation plan.
