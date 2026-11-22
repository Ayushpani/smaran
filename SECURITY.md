# Security policy

## Reporting a vulnerability

If you find a security issue in Smaran, please report it privately —
**don't open a public GitHub issue**.

Email: [ayushpanigrahi84@gmail.com](mailto:ayushpanigrahi84@gmail.com)
with the subject line `[smaran-security]`.

Include:

- What the vulnerability is
- Steps to reproduce
- What version / commit you tested on
- Your suggested severity, if any

I'll acknowledge within 72 hours and work with you on a fix and
coordinated disclosure. If the issue turns out to be real and material,
you'll be credited in the fix commit (unless you'd rather stay
anonymous).

## What's in scope

- The published npm packages under `@repo/*` (once published)
- The Hono API (`apps/api`)
- The MCP server (`apps/mcp`)
- The Cloudflare edge worker (`apps/edge-recall`)
- Adapter packages (`packages/adapter-*`)

## What's out of scope

- Third-party services (Supabase, Cloudflare, Vapi, LiveKit, provider
  LLM APIs) — report those to the vendor directly.
- Test fixtures, example configs, docs.
- Any deployment you run yourself using non-default settings that
  weaken security (`STORE=memory` in production, exposing the sandbox
  API key, disabling RLS, etc.). Sandbox mode is for local demo only.

## Handling of API keys and PII

- API keys are stored SHA-256-hashed in the `api_keys` table — the raw
  value is never persisted, only shown once at seed time.
- The `data-pipeline` package includes a PII scrubber for common
  identifiers (email, phone, Aadhaar, PAN, GSTIN, UPI, credit card,
  IPs, URLs with tokens). It runs on training-sample extraction, not
  by default on every save — enable it explicitly for pipelines that
  process user content.
- DPDP right-to-forget (`POST /v1/dpdp/right-to-forget`) does a
  cascade delete of memories + sessions and returns the counts for
  audit.
