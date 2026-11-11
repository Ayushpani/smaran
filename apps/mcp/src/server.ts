import { McpAgent } from "agents/mcp"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { ApiError, DEFAULT_USER_ID, SmaranClient } from "./client"
import { initPosthog, posthog } from "./posthog"
import { z } from "zod"

type Env = {
	MCP_SERVER: DurableObjectNamespace
	API_URL?: string
	POSTHOG_API_KEY?: string
}

type Props = {
	apiKey: string
}

const memorySchema = z.object({
	content: z
		.string()
		.max(50_000, "Content exceeds the API's maximum of 50,000 characters")
		.describe("The memory content to save or forget"),
	action: z.enum(["save", "forget"]).optional().default("save"),
	userId: z
		.string()
		.max(200)
		.optional()
		.describe("Scope memories to a specific user (defaults to a single shared space)"),
	sessionId: z.string().max(200).optional().describe("Group this memory under a session/conversation"),
})

const recallSchema = z.object({
	query: z
		.string()
		.min(1)
		.max(1000, "Query exceeds maximum length of 1,000 characters")
		.describe("The search query to find relevant memories"),
	userId: z.string().max(200).optional().describe("Scope recall to a specific user"),
	sessionId: z.string().max(200).optional().describe("Scope recall to a specific session"),
	limit: z.number().int().min(1).max(20).optional().default(5),
})

type MemoryArgs = z.infer<typeof memorySchema>
type RecallArgs = z.infer<typeof recallSchema>

export class SmaranMCP extends McpAgent<Env, unknown, Props> {
	private clientInfo: { name: string; version?: string } | null = null

	server = new McpServer({
		name: "smaran",
		version: "0.1.0",
	})

	async init() {
		const storedClientInfo = await this.ctx.storage.get<{ name: string; version?: string }>(
			"clientInfo",
		)
		if (storedClientInfo) {
			this.clientInfo = storedClientInfo
		}

		initPosthog(this.env.POSTHOG_API_KEY)

		this.server.server.oninitialized = async () => {
			const clientVersion = this.server.server.getClientVersion()
			if (clientVersion) {
				this.clientInfo = { name: clientVersion.name, version: clientVersion.version }
				await this.ctx.storage.put("clientInfo", this.clientInfo)
			}
		}

		this.server.registerTool(
			"memory",
			{
				description:
					"Save or forget information about the user. Use 'save' when the user shares preferences, facts, or asks to remember something. Use 'forget' when information is outdated or the user asks to remove it — you can pass the fact in plain text, it doesn't need to be an exact match.",
				inputSchema: memorySchema,
			},
			// @ts-expect-error - zod type inference issue with MCP SDK
			(args: MemoryArgs) => this.handleMemory(args),
		)

		this.server.registerTool(
			"recall",
			{
				description: "Search the user's memories for facts relevant to the current conversation.",
				inputSchema: recallSchema,
			},
			// @ts-expect-error - zod type inference issue with MCP SDK
			(args: RecallArgs) => this.handleRecall(args),
		)

		this.server.registerPrompt(
			"context",
			{
				description:
					"A reminder for the model to save memory-worthy facts as the conversation goes, and how to recall them.",
			},
			async () => ({
				messages: [
					{
						role: "user" as const,
						content: {
							type: "text" as const,
							text: "Whenever the user shares a fact, preference, or personal detail worth remembering, use the `memory` tool to save it. Before answering something that might depend on past context, use the `recall` tool to check what's already known.",
						},
					},
				],
			}),
		)
	}

	private getClient(): SmaranClient {
		if (!this.props?.apiKey) {
			throw new Error("Authentication required")
		}
		if (!this.env.API_URL) {
			throw new Error(
				"Smaran API server is not configured. Set the API_URL binding to your self-hosted or managed Smaran API.",
			)
		}
		return new SmaranClient(this.props.apiKey, this.env.API_URL)
	}

	private async handleMemory(args: MemoryArgs) {
		const { content, action = "save", sessionId } = args
		const userId = args.userId || DEFAULT_USER_ID

		try {
			const client = this.getClient()
			const clientInfo = await this.getClientInfo()

			if (action === "forget") {
				const result = await client.forgetByContent(content, userId, sessionId)

				posthog
					.memoryForgot({
						userId,
						content_length: content.length,
						source: "mcp",
						mcp_client_name: clientInfo?.name,
						mcp_client_version: clientInfo?.version,
						sessionId: this.getMcpSessionId(),
					})
					.catch((error) => console.error("PostHog tracking error:", error))

				if (!result.found) {
					return {
						content: [
							{ type: "text" as const, text: "No matching memory found close enough to forget." },
						],
					}
				}

				return {
					content: [
						{
							type: "text" as const,
							text: `Forgot memory: "${result.deletedText}" (match confidence: ${Math.round((result.similarity ?? 0) * 100)}%)`,
						},
					],
				}
			}

			const result = await client.save(content, userId, sessionId)

			posthog
				.memoryAdded({
					type: "note",
					content_length: content.length,
					source: "mcp",
					userId,
					mcp_client_name: clientInfo?.name,
					mcp_client_version: clientInfo?.version,
					sessionId: this.getMcpSessionId(),
				})
				.catch((error) => console.error("PostHog tracking error:", error))

			if (!result.saved) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Not saved — the text looked like a question or was too short to be a standalone fact.",
						},
					],
				}
			}

			return {
				content: [{ type: "text" as const, text: `Saved memory (id: ${result.id})` }],
			}
		} catch (error) {
			return { content: [{ type: "text" as const, text: `Error: ${describeError(error)}` }], isError: true }
		}
	}

	private async handleRecall(args: RecallArgs) {
		const { query, sessionId, limit = 5 } = args
		const userId = args.userId || DEFAULT_USER_ID

		try {
			const client = this.getClient()
			const clientInfo = await this.getClientInfo()
			const startTime = Date.now()

			const { hits } = await client.recall(query, userId, sessionId, limit)

			posthog
				.memorySearch({
					query_length: query.length,
					results_count: hits.length,
					search_duration_ms: Date.now() - startTime,
					source: "mcp",
					userId,
					mcp_client_name: clientInfo?.name,
					mcp_client_version: clientInfo?.version,
					sessionId: this.getMcpSessionId(),
				})
				.catch((error) => console.error("PostHog tracking error:", error))

			if (hits.length === 0) {
				return { content: [{ type: "text" as const, text: "No memories found." }] }
			}

			const parts = ["## Relevant memories"]
			for (const [i, hit] of hits.entries()) {
				parts.push(`\n### Memory ${i + 1}`)
				parts.push(hit.text)
			}

			return { content: [{ type: "text" as const, text: parts.join("\n") }] }
		} catch (error) {
			return { content: [{ type: "text" as const, text: `Error: ${describeError(error)}` }], isError: true }
		}
	}

	private async getClientInfo(): Promise<{ name: string; version?: string } | undefined> {
		if (this.clientInfo) return this.clientInfo
		const stored = await this.ctx.storage.get<{ name: string; version?: string }>("clientInfo")
		if (stored) {
			this.clientInfo = stored
			return this.clientInfo
		}
		return undefined
	}

	private getMcpSessionId(): string {
		return this.ctx.id.name || "unknown"
	}
}

function describeError(error: unknown): string {
	if (error instanceof ApiError) return error.message
	if (error instanceof Error) return error.message
	return "An unexpected error occurred"
}
