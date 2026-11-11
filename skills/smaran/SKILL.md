---
name: smaran
description: Use when building an AI agent or voice agent that needs to remember facts about a user across turns or sessions with Smaran's self-hosted memory API (save, recall, forget over HTTP).
---

# Smaran memory API

Smaran stores short facts about a user and returns the relevant ones for a
query. All endpoints take `Authorization: Bearer <SMARAN_API_KEY>` and JSON.
Base URL comes from `SMARAN_URL` (local sandbox: `http://localhost:8787`,
key `sk_local_dev`, started with `bun run try`).

## Save

`POST /v1/memories`

```json
{ "text": "I prefer window seats. My daughter loves elephants.", "userId": "u1", "sessionId": "s1" }
```

Text is split into sentences, cleaned (self-corrections like "13… sorry
913" keep only the corrected value) and stored. Pure confirmation questions
are skipped (`"skipped": "question-or-tooshort"`). A near-identical
restatement replaces the older memory instead of duplicating it.

## Recall

`POST /v1/recall`

```json
{ "query": "what does my kid like", "userId": "u1", "topK": 5 }
```

Returns `hits[]` of `{ memory: { id, text, kind }, score, tier }`, best
first. Scores are rank-fusion values for ordering only — do not threshold
on them. Optional: `sessionId`, `includeCrossSession` (default true),
`rerank`, `asOf` (ISO time, for point-in-time recall).

## Forget

`DELETE /v1/memories/:id` → 204.

## Voice transcripts

Stream partials with `POST /v1/ingest/partial { sessionId, text }` and
finalize the turn with `POST /v1/ingest/commit { sessionId, userId }`.

## How to use it in an agent

1. Before generating a reply, recall with the latest user message and put
   the hits in the system prompt inside `<recalled-memories>` tags.
2. After the user states a durable fact or preference, save one concise,
   self-contained sentence — not the whole message.
3. Always pass a stable `userId`; memories are only shared across sessions
   for the same `userId`.

SDKs: `@smaranai/sdk-ts` (`new Smaran({ apiKey, baseUrl })`) and the Python
`smaran` package (`Smaran(api_key=..., base_url=...)`).
