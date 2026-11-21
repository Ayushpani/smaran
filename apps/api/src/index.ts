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
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { apiKeyAuth, sandboxAuth } from "./auth.ts"
import { loadEnv } from "./env.ts"
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
	.use(logger())
	.use(cors({ origin: env.CORS_ORIGIN }))
	.get("/health", (c) =>
		c.json({ ok: true, store: env.STORE, embedder: embedderName }),
	)
	.get("/", (c) =>
		c.json({
			name: "smaran-api",
			version: "0.1.0",
			mode: isSandbox ? "sandbox" : "persistent",
			docs: "https://github.com/Ayushpani/smaran",
		}),
	)

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

export default { port, fetch: app.fetch }

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
