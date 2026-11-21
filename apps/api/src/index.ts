import {
	createCore,
	createLocalEmbedder,
	createOpenAIEmbedder,
	HashEmbedder,
	HeuristicConsolidator,
	InMemoryStore,
	type Embedder,
	type MemoryStore,
} from "@repo/core"
import {
	createDb,
	createGraphStore,
	createSupabaseStore,
	type Db,
} from "@repo/db"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { sql } from "drizzle-orm"
import { apiKeyAuth, sandboxAuth } from "./auth.ts"
import { loadEnv } from "./env.ts"
import {
	errorBody,
	notFound,
	onError,
	rateLimit,
	requestContext,
} from "./http.ts"
import { createModelResolver } from "./model-resolver.ts"
import { dpdpRouter } from "./routes/dpdp.ts"
import { graphRouter } from "./routes/graph.ts"
import { ingestRouter } from "./routes/ingest.ts"
import { memoriesRouter } from "./routes/memories.ts"
import { modelsRouter } from "./routes/models.ts"
import { profileRouter } from "./routes/profile.ts"
import { recallRouter } from "./routes/recall.ts"
import { sessionsRouter } from "./routes/sessions.ts"

const env = loadEnv()

const isSandbox = env.STORE === "memory"

let store: MemoryStore
let db: Db | undefined
if (isSandbox) {
	store = new InMemoryStore()
} else {
	db = createDb({ url: env.DATABASE_URL! })
	store = createSupabaseStore(db)
}

// NOTE: fail loud on misconfigured openai — silent fall-through to
// HashEmbedder would poison benchmarks (results labelled 'openai' would
// actually be measuring hash).
let embedder: Embedder
if (env.EMBEDDER === "openai") {
	if (!env.OPENAI_API_KEY) {
		throw new Error(
			"EMBEDDER=openai but OPENAI_API_KEY is unset. Provide the key or set EMBEDDER=hash.",
		)
	}
	embedder = createOpenAIEmbedder({
		apiKey: env.OPENAI_API_KEY,
		model: env.OPENAI_EMBED_MODEL,
		baseUrl: env.OPENAI_BASE_URL,
	})
} else if (env.EMBEDDER === "local") {
	const local = createLocalEmbedder({
		model: env.LOCAL_EMBED_MODEL,
		cacheDir: env.MODEL_CACHE_DIR,
	})
	// Load at boot (first run downloads ~120 MB) so no request pays for it.
	const t0 = performance.now()
	await local.warm()
	console.log(
		`embedder: ${local.model} loaded in ${Math.round(performance.now() - t0)}ms`,
	)
	embedder = local
} else {
	embedder = new HashEmbedder()
}
const embedderName = env.EMBEDDER

const core = createCore({
	store,
	embedder,
	consolidator: new HeuristicConsolidator(),
	// Sandbox mode has no Postgres, so no entity/relations tables — dense
	// + keyword channels still fuse fine without the graph channel.
	graph: isSandbox ? undefined : createGraphStore(db!),
})

const app = new Hono()
	.use(requestContext())
	.use(
		cors({
			origin: env.CORS_ORIGIN,
			exposeHeaders: ["X-Request-Id", "Retry-After"],
		}),
	)
	// Liveness: the process is up.
	.get("/health", (c) =>
		c.json({ ok: true, store: env.STORE, embedder: embedderName }),
	)
	// Readiness: dependencies answer. Load balancers should route on this.
	.get("/ready", async (c) => {
		try {
			if (db) await db.execute(sql`SELECT 1`)
			return c.json({ ready: true })
		} catch {
			return c.json({ ready: false, reason: "database unreachable" }, 503)
		}
	})
	.get("/", (c) =>
		c.json({
			name: "smaran-api",
			version: "0.1.0",
			mode: isSandbox ? "sandbox" : "persistent",
			docs: "https://github.com/Ayushpani/smaran",
		}),
	)
	.use(
		"/v1/*",
		bodyLimit({
			maxSize: env.MAX_BODY_BYTES,
			onError: (c) =>
				c.json(
					errorBody(c, "payload_too_large", "request body too large"),
					413,
				),
		}),
	)
	.use(
		"/v1/*",
		rateLimit({
			perMinute: env.RATE_LIMIT_PER_MINUTE,
			key: (c) =>
				c.req.header("Authorization") ??
				c.req.header("x-forwarded-for") ??
				"anonymous",
		}),
	)

app.onError(onError)
app.notFound(notFound)

if (isSandbox) {
	app
		.use("/v1/*", sandboxAuth(env.SANDBOX_API_KEY))
		.route("/v1/memories", memoriesRouter(core))
		.route("/v1/recall", recallRouter(core, createSandboxResolver()))
		.route("/v1/sessions", sessionsRouter(core))
		.route("/v1/ingest", ingestRouter(core))
} else {
	const modelResolver = createModelResolver(db!)
	app
		.use("/v1/*", apiKeyAuth(db!))
		.route("/v1/memories", memoriesRouter(core))
		.route("/v1/recall", recallRouter(core, modelResolver))
		.route("/v1/sessions", sessionsRouter(core))
		.route("/v1/ingest", ingestRouter(core))
		.route("/v1/dpdp", dpdpRouter(db!))
		.route("/v1/graph", graphRouter(db!))
		.route("/v1/models", modelsRouter(db!, modelResolver))
		.route(
			"/v1/profile",
			profileRouter(db!, { topicSimilarity: embedder.topicSimilarity }),
		)
}

const port = env.PORT
if (isSandbox) {
	console.log("┌─────────────────────────────────────────────────────────────┐")
	console.log("│ Smaran sandbox mode — data is NOT persisted                 │")
	console.log("├─────────────────────────────────────────────────────────────┤")
	console.log(
		`│ URL:     http://localhost:${port}${" ".repeat(35 - String(port).length)}│`,
	)
	console.log(
		`│ Key:     ${env.SANDBOX_API_KEY}${" ".repeat(51 - env.SANDBOX_API_KEY.length)}│`,
	)
	console.log("│ Restart: memories vanish. Use STORE=supabase for real use.  │")
	console.log("└─────────────────────────────────────────────────────────────┘")
} else {
	console.log(
		`smaran-api → http://localhost:${port} (embedder: ${env.EMBEDDER})`,
	)
}

// Named (not default) export: Bun auto-serves a default export with `fetch`,
// which would double-bind the port alongside Bun.serve below.
export const handler = app.fetch

// When run directly (not imported by tests), serve with graceful shutdown:
// on SIGTERM/SIGINT stop accepting connections, let in-flight requests
// finish, then close the database pool.
if (import.meta.main) {
	const server = Bun.serve({ port, fetch: app.fetch, idleTimeout: 120 })
	const shutdown = async (signal: string) => {
		console.log(JSON.stringify({ level: "info", msg: "shutdown", signal }))
		await server.stop()
		const client = (
			db as unknown as { $client?: { end(o?: object): Promise<void> } }
		)?.$client
		await client?.end({ timeout: 5 })
		process.exit(0)
	}
	process.on("SIGTERM", () => void shutdown("SIGTERM"))
	process.on("SIGINT", () => void shutdown("SIGINT"))
}

/**
 * A no-op ModelResolver for sandbox mode. In persistent mode the real
 * resolver reads from the model_registry table; in sandbox we always
 * fall through to the built-in HeuristicReranker.
 */
function createSandboxResolver() {
	return {
		resolve: async (tenantId: string) => {
			const { HeuristicReranker } = await import("@repo/models")
			return {
				tenantId,
				reranker: new HeuristicReranker(),
				source: "builtin" as const,
			}
		},
		resolveEmbedder: async (tenantId: string) => ({
			tenantId,
			embedder,
			source: "builtin" as const,
		}),
		invalidate: () => {},
	}
}
