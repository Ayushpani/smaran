# @repo/site

The Smaran website: landing page, docs, sign-up and console. Next.js 15
(app router), GSAP for scroll and text animation, three.js for the
architecture scene (loaded lazily when that section mounts).

## Dev

```bash
bun install
NEXT_PUBLIC_SMARAN_API_URL=http://localhost:8787 bun run dev
```

Opens `http://localhost:3001`. `NEXT_PUBLIC_SMARAN_API_URL` is the Smaran API
that sign-up and the console talk to; it is inlined at build time. Without it
the sign-up page says sign-up isn't open, and the console asks for a server.
The API must allow the site's origin (`CORS_ORIGIN`, default `*`).

## Playground

`/playground` lets visitors talk to demo agents (browser speech in and out)
with Smaran memory, next to the same agent without memory. Its server routes
(`app/api/playground/*`) need these server-side variables; without them the
page shows an example conversation instead.

| Variable                  | What it is                                                               |
| ------------------------- | ------------------------------------------------------------------------ |
| `SMARAN_PLAYGROUND_URL`   | A Smaran API the playground stores demo memories in                      |
| `SMARAN_PLAYGROUND_KEY`   | An API key for a tenant used only by the playground                      |
| `PLAYGROUND_LLM_API_KEY`  | Key for any OpenAI-compatible chat API (Groq and Gemini have free tiers) |
| `PLAYGROUND_LLM_BASE_URL` | Defaults to `https://api.groq.com/openai/v1`                             |
| `PLAYGROUND_LLM_MODEL`    | Defaults to `openai/gpt-oss-20b`                                         |

Each visitor gets an anonymous ID in localStorage; memories are stored per
visitor and agent as `pg-<id>-<agent>`, and "Erase my demo memories" calls
the DPDP erase endpoint, which needs Postgres mode. Per-visitor and per-IP
daily turn limits live in `lib/playground/limits.ts`; the playground tenant's
own rate limit is the global cap. The agent loop is `lib/playground/agent.ts`
and uses `@smaranai/sdk-ts`.

## Structure

- `app/page.tsx` — landing: hero (live self-correction), architecture
  (pinned three.js scene), story (pinned caller history), स्मरण interlude
  with the language demo, recall fusion, numbers, code, start.
- `app/docs/**` — MDX docs from `content/docs`, sidebar, contents, pager.
- `app/signup` — `POST /v1/signup`; hands the new key to the console.
- `app/console` — log in with an API key (kept in sessionStorage), usage,
  key create/revoke, and a playground that calls `/v1/memories` and
  `/v1/recall` and shows corrections, channels and latency.
- `components/site` — nav, footer, palette switch, grain.
- `components/landing` — one file per landing section.
- `lib/palette.ts` — palettes (cobalt, ink, chalk). The choice is stored in
  localStorage and applied before first paint; dark-mode users start on ink.
- `app/globals.css` — every colour is a token per palette.

Every number on the landing page comes from `RESULTS.md`. With
`prefers-reduced-motion`, every section renders its finished state.
