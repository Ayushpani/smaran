import { cors } from "hono/cors"
import { Hono, type Context } from "hono"
import { SmaranMCP } from "./server"
import { initPosthog } from "./posthog"

type Bindings = {
	MCP_SERVER: DurableObjectNamespace
	API_URL?: string
	POSTHOG_API_KEY?: string
}

type Props = {
	apiKey: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"Accept",
			"Mcp-Session-Id",
			"MCP-Protocol-Version",
			"Last-Event-ID",
		],
		exposeHeaders: ["Mcp-Session-Id"],
	}),
)

app.use("*", async (c, next) => {
	initPosthog(c.env.POSTHOG_API_KEY)
	await next()
})

app.get("/", (c) => {
	return c.json({
		name: "smaran-mcp",
		version: "0.1.0",
		description: "Give your AI a memory",
		docs: "https://github.com/Ayushpani/smaran",
	})
})

const mcpHandler = SmaranMCP.serve("/mcp", {
	binding: "MCP_SERVER",
	corsOptions: {
		origin: "*",
		methods: "GET, POST, DELETE, OPTIONS",
		headers: "Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
	},
})

// Auth here is intentionally simple: a Smaran API key as a Bearer token,
// forwarded as-is on every call to apps/api, which already validates it.
// No separate session/OAuth exchange — the self-hosted API is the only
// source of truth for whether a key is valid.
const handleMcpRequest = async (c: Context<{ Bindings: Bindings }>) => {
	const authHeader = c.req.header("Authorization")
	const apiKey = authHeader?.replace(/^Bearer\s+/i, "")

	if (!apiKey) {
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Unauthorized: missing Smaran API key" },
				id: null,
			}),
			{
				status: 401,
				headers: {
					"Content-Type": "application/json",
					"WWW-Authenticate": 'Bearer error="invalid_token"',
					"Access-Control-Allow-Origin": "*",
				},
			},
		)
	}

	const ctx = {
		...c.executionCtx,
		props: { apiKey } satisfies Props,
	} as ExecutionContext & { props: Props }

	return mcpHandler.fetch(c.req.raw, c.env, ctx)
}

app.all("/mcp", handleMcpRequest)
app.all("/mcp/*", handleMcpRequest)

// Export the Durable Object class for Cloudflare Workers
export { SmaranMCP }

export default app
