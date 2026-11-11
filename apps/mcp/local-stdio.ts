#!/usr/bin/env bun
/**
 * Local stdio MCP server — run Smaran memory tools in Claude Desktop,
 * Cursor or any stdio MCP client with no Cloudflare deployment.
 *
 *   SMARAN_URL=http://localhost:8787 SMARAN_API_KEY=sk_local_dev bun run local-stdio.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { DEFAULT_USER_ID, SmaranClient } from "./src/client.ts"

const apiUrl = process.env.SMARAN_URL ?? "http://localhost:8787"
const apiKey = process.env.SMARAN_API_KEY
if (!apiKey) {
	console.error("SMARAN_API_KEY is required")
	process.exit(1)
}
const client = new SmaranClient(apiKey, apiUrl)
const server = new McpServer({ name: "smaran", version: "0.1.0" })

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })

server.registerTool(
	"memory",
	{
		description:
			"Save or forget a fact about the user. Use 'save' for preferences, facts, or anything the user asks to remember; 'forget' when it is outdated or the user asks to remove it.",
		inputSchema: {
			content: z.string().min(1).max(50_000),
			action: z.enum(["save", "forget"]).default("save"),
			userId: z.string().max(200).optional(),
			sessionId: z.string().max(200).optional(),
		},
	},
	async ({ content, action, userId, sessionId }) => {
		const uid = userId || DEFAULT_USER_ID
		if (action === "forget") {
			const r = await client.forgetByContent(content, uid, sessionId)
			return text(r.found ? `Forgot: ${r.deletedText}` : "No matching memory found.")
		}
		const r = await client.save(content, uid, sessionId)
		return text(r.saved ? "Saved." : "Not saved (question or too short).")
	},
)

server.registerTool(
	"recall",
	{
		description: "Search the user's memories for facts relevant to the conversation.",
		inputSchema: {
			query: z.string().min(1).max(1_000),
			userId: z.string().max(200).optional(),
			sessionId: z.string().max(200).optional(),
			limit: z.number().int().min(1).max(20).default(5),
		},
	},
	async ({ query, userId, sessionId, limit }) => {
		const r = await client.recall(query, userId || DEFAULT_USER_ID, sessionId, limit)
		if (r.hits.length === 0) return text("No relevant memories.")
		return text(r.hits.map((h) => `- ${h.text}`).join("\n"))
	},
)

await server.connect(new StdioServerTransport())
console.error(`smaran MCP (stdio) → ${apiUrl}`)
