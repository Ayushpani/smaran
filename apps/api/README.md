# `@repo/api`

Self-hosted memory API. Hono over Bun, Postgres+pgvector via Supabase.

## First run

```bash
# 1. Create a Supabase project → Settings → Database.
# 2. Copy the pooled and direct connection strings.
cp apps/api/.env.example apps/api/.env
$EDITOR apps/api/.env   # set DATABASE_URL (pooled)

# 3. Run the initial migration (use the DIRECT 5432 URL for this).
DATABASE_URL="postgresql://…:5432/postgres" \
  bun --filter @repo/db db:migrate

# 4. Seed a tenant + API key.
DATABASE_URL="postgresql://…:5432/postgres" \
  bun --filter @repo/db db:seed dev
# → prints the API key. Copy it.

# 5. Start the API.
bun --filter @repo/api dev
```

## Endpoints

| Verb   | Path                         | Purpose                             |
| ------ | ---------------------------- | ----------------------------------- |
| GET    | `/health`                    | Liveness + which embedder is wired. |
| POST   | `/v1/memories`               | Save one or more memories.          |
| DELETE | `/v1/memories/:id`           | Forget a memory.                    |
| POST   | `/v1/recall`                 | Semantic recall + per-hop latency.  |
| GET    | `/v1/sessions/:id/subscribe` | SSE stream of memory events.        |

All `/v1/*` routes require `Authorization: Bearer <api key>`.

## Embedder

Default is `HashEmbedder` — deterministic, no network, meant only to prove the
pipeline end-to-end. Set `EMBEDDER=openai` with an `OPENAI_API_KEY` for real
embeddings; the same env vars work against any OpenAI-compatible endpoint
(Groq, Together, Ollama, LM Studio) by pointing `OPENAI_BASE_URL` at it.

Phase 5 replaces both with voice-tuned distilled models.
