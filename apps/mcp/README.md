# Smaran MCP Server

A standalone MCP (Model Context Protocol) server for Smaran, giving any MCP-compatible AI assistant (Claude Desktop, Claude Code, Cursor, Windsurf, and any other MCP client) persistent memory across conversations. Built on Cloudflare Workers with Durable Objects.

## Features

- **Simple API key auth** — one Smaran API key, passed as a Bearer token. No accounts, no OAuth flow.
- **`memory` and `recall` tools** — the two things a memory layer actually needs, mapped directly onto Smaran's real `/v1/memories` and `/v1/recall` API.
- **Analytics** — optional PostHog integration for usage tracking.

## Setup

Add to your MCP client config (Claude Desktop, Cursor, Windsurf, Claude Code, etc.):

```json
{
	"mcpServers": {
		"smaran": {
			"url": "https://your-mcp-deployment/mcp",
			"headers": {
				"Authorization": "Bearer sk_your_smaran_api_key"
			}
		}
	}
}
```

Get an API key from your self-hosted Smaran deployment (sandbox mode ships with `sk_local_dev` — see the root [README](../../README.md#try-it-in-30-seconds)).

## Tools

### `memory`

Save or forget information about the user.

```json
{
	"content": "User prefers dark mode and uses TypeScript",
	"action": "save",
	"userId": "optional-user-id",
	"sessionId": "optional-session-id"
}
```

| Parameter   | Type                   | Required | Description                                                                                                         |
| ----------- | ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `content`   | string                 | Yes      | The memory content to save, or a description of what to forget                                                      |
| `action`    | `"save"` \| `"forget"` | No       | Default: `"save"`. `"forget"` finds the closest matching memory by content and deletes it — no need to know its ID. |
| `userId`    | string                 | No       | Scope to a specific user. Defaults to a single shared space.                                                        |
| `sessionId` | string                 | No       | Group this memory under a session/conversation.                                                                     |

### `recall`

Search the user's memories.

```json
{
	"query": "What are the user's programming preferences?",
	"userId": "optional-user-id",
	"sessionId": "optional-session-id",
	"limit": 5
}
```

| Parameter   | Type   | Required | Description                            |
| ----------- | ------ | -------- | -------------------------------------- |
| `query`     | string | Yes      | Search query to find relevant memories |
| `userId`    | string | No       | Scope recall to a specific user        |
| `sessionId` | string | No       | Scope recall to a specific session     |
| `limit`     | number | No       | Max results (1-20). Default: 5         |

## Prompts

| Name      | Description                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context` | A reminder for the model to save memory-worthy facts as the conversation goes, and to recall before answering things that might depend on past context. |

## Development

### Prerequisites

- [Bun](https://bun.sh/) or Node.js
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Install Dependencies

```bash
bun install
```

### Environment Variables

Create a `.dev.vars` file:

```env
API_URL=http://localhost:8787
```

| Variable          | Description                                  | Required |
| ----------------- | -------------------------------------------- | -------- |
| `API_URL`         | Your Smaran API URL (self-hosted or managed) | Yes      |
| `POSTHOG_API_KEY` | Optional analytics                           | No       |

### Run Locally

```bash
bun run dev
```

The server starts at `http://localhost:8788`. You'll also need the Smaran API itself running at `API_URL` — see [`apps/api`](../api).

### Deploy

```bash
bun run deploy
```

Set `API_URL` in `wrangler.jsonc` (or `--var API_URL:...`) to your production Smaran API before deploying — the checked-in default is for local dev only. This deploys to your `*.workers.dev` subdomain; add a `routes` block to `wrangler.jsonc` once you have a custom domain to point at it.

## Architecture

```
┌─────────────────┐   Bearer API key   ┌──────────────────┐
│   MCP Client    │◄───────────────────►│   Smaran MCP     │
│ (Claude, Cursor)│    MCP protocol      │   Server         │
└─────────────────┘                     └────────┬─────────┘
                                                   │ Bearer API key,
                                                   │ forwarded as-is
                                                   ▼
                                         ┌──────────────────┐
                                         │   Smaran API     │
                                         │  (apps/api)      │
                                         │  /v1/recall       │
                                         │  /v1/memories     │
                                         └──────────────────┘
```

The MCP server does not validate API keys itself — it forwards the Bearer
token on every call, and `apps/api` (the only source of truth for what's
valid) rejects invalid keys with a normal 401.

## Tech Stack

- **Runtime:** Cloudflare Workers
- **State:** Durable Objects (session/client-info persistence)
- **Framework:** Hono
- **MCP SDK:** `@modelcontextprotocol/sdk` + `agents`
- **API Client:** first-party (`src/client.ts`), no third-party SDK
- **Analytics:** PostHog (optional)
