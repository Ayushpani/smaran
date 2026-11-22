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
