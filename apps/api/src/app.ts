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
	createPgEventBus,
	createPgIngestBuffers,
	createPgRateLimitStore,
	createSupabaseStore,
	type Db,
	type PgEventBus,
} from "@repo/db"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { sql } from "drizzle-orm"
import { apiKeyAuth, auth, sandboxAuth } from "./auth.ts"
import { createQuotaGuard } from "./quota.ts"
import { keysRouter, signupRouter, usageRouter } from "./routes/account.ts"
import type { Env } from "./env.ts"
import {
	clientIp,
	createMemoryRateLimitStore,
	errorBody,
	notFound,
	onError,
	rateLimit,
	requestContext,
} from "./http.ts"
import { createLocalCrossEncoder, type Reranker } from "@repo/models"
import { createModelResolver } from "./model-resolver.ts"
import { buildOpenApi } from "./openapi.ts"
import { dpdpRouter } from "./routes/dpdp.ts"
import { graphRouter } from "./routes/graph.ts"
import { createMemoryIngestBuffers, ingestRouter } from "./routes/ingest.ts"
import { memoriesRouter } from "./routes/memories.ts"
import { modelsRouter } from "./routes/models.ts"
import { profileRouter } from "./routes/profile.ts"
import { recallRouter } from "./routes/recall.ts"
import { sessionsRouter } from "./routes/sessions.ts"

export interface SmaranApp {
	app: Hono
	/** Release connections (event bus, DB pool). */
	close(): Promise<void>
	mode: "sandbox" | "persistent"
}

/**
 * Builds the API from configuration. All wiring lives here so tests (and
 * embedders of the API) can construct instances with explicit settings;
 * index.ts only loads env, logs and serves.
 */
export async function createApp(env: Env): Promise<SmaranApp> {
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

	// Built-in reranker: a free local cross-encoder (default), or none.
	let builtInReranker: Reranker | null = null
	if (env.RERANKER === "local") {
		const ce = createLocalCrossEncoder({
			model: env.RERANK_MODEL,
			cacheDir: env.MODEL_CACHE_DIR,
		})
		const t0 = performance.now()
		await ce.warm()
		console.log(
			`reranker: ${ce.model} loaded in ${Math.round(performance.now() - t0)}ms`,
		)
		builtInReranker = ce
	}

	// Shared state: Postgres when several instances must act as one.
	const sharedPg =
		env.SHARED_STATE === "postgres" ||
		(env.SHARED_STATE === "auto" && !isSandbox)
	if (sharedPg && !db) {
		throw new Error(
			"SHARED_STATE=postgres requires STORE=supabase and DATABASE_URL",
		)
	}
	let eventBus: PgEventBus | undefined
	if (sharedPg) {
		eventBus = createPgEventBus(env.EVENTS_DATABASE_URL ?? env.DATABASE_URL!)
		await eventBus.ready
	}
	const ingestBuffers = sharedPg
		? createPgIngestBuffers(db!)
		: createMemoryIngestBuffers()
	const rateLimitStore = sharedPg
		? createPgRateLimitStore(db!)
		: createMemoryRateLimitStore()

	const core = createCore({
		store,
		embedder,
		consolidator: new HeuristicConsolidator(),
		// Sandbox mode has no Postgres, so no entity/relations tables — dense
		// + keyword channels still fuse fine without the graph channel.
		graph: isSandbox ? undefined : createGraphStore(db!),
		events: eventBus,
	})

	const openapi = buildOpenApi({ persistent: !isSandbox })

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
		// Machine-readable API description — generate a client in any language.
		.get("/openapi.json", (c) => c.json(openapi))
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
		// Pre-auth, per IP: cheap protection for the auth lookup itself.
		.use(
			"/v1/*",
			rateLimit({
				perMinute: env.RATE_LIMIT_PER_IP_PER_MINUTE,
				store: rateLimitStore,
				key: (c) => `ip:${clientIp(c)}`,
			}),
		)

	app.onError(onError)
	app.notFound(notFound)

	// Post-auth, per tenant: the plan's limit, else the server default.
	const tenantRateLimit = rateLimit({
		perMinute: (c) => auth(c).rateLimitPerMinute ?? env.RATE_LIMIT_PER_MINUTE,
		store: rateLimitStore,
		key: (c) => `tenant:${auth(c).tenantId}`,
	})
	const quota = createQuotaGuard(db)

	if (isSandbox) {
		app
			.use("/v1/*", sandboxAuth(env.SANDBOX_API_KEY))
			.use("/v1/*", tenantRateLimit)
			.route("/v1/memories", memoriesRouter(core, quota))
			.route(
				"/v1/recall",
				recallRouter(
					core,
					createSandboxResolver(builtInReranker, embedder),
					env.RERANK_POOL,
				),
			)
			.route("/v1/sessions", sessionsRouter(core))
			.route("/v1/ingest", ingestRouter(core, ingestBuffers, quota))
	} else {
		const modelResolver = createModelResolver(db!, builtInReranker)
		const keyAuth = apiKeyAuth(db!)
		app
			// Public signup is registered before auth, with its own strict limit.
			.use(
				"/v1/signup",
				rateLimit({
					perMinute: env.SIGNUP_PER_IP_PER_MINUTE,
					store: rateLimitStore,
					key: (c) => `signup:${clientIp(c)}`,
				}),
			)
			.route(
				"/v1/signup",
				signupRouter(db!, {
					mode: env.SIGNUP_MODE,
					freeMemoryQuota: env.FREE_MEMORY_QUOTA,
					freeRateLimitPerMinute: env.FREE_RATE_LIMIT_PER_MINUTE,
				}),
			)
			.use("/v1/*", keyAuth)
			.use("/v1/*", tenantRateLimit)
			.route("/v1/keys", keysRouter(db!, keyAuth))
			.route("/v1/usage", usageRouter(quota))
			.route("/v1/memories", memoriesRouter(core, quota))
			.route("/v1/recall", recallRouter(core, modelResolver, env.RERANK_POOL))
			.route("/v1/sessions", sessionsRouter(core))
			.route("/v1/ingest", ingestRouter(core, ingestBuffers, quota))
			.route("/v1/dpdp", dpdpRouter(db!))
			.route("/v1/graph", graphRouter(db!))
			.route("/v1/models", modelsRouter(db!, modelResolver))
			.route(
				"/v1/profile",
				profileRouter(db!, { topicSimilarity: embedder.topicSimilarity }),
			)
	}

	return {
		app,
		mode: isSandbox ? "sandbox" : "persistent",
		async close() {
			await eventBus?.close()
			const client = (
				db as unknown as { $client?: { end(o?: object): Promise<void> } }
			)?.$client
			await client?.end({ timeout: 5 })
		},
	}
}

/** Sandbox has no model registry: always the built-in reranker (or none). */
function createSandboxResolver(reranker: Reranker | null, embedder: Embedder) {
	return {
		resolve: async (tenantId: string) => ({
			tenantId,
			reranker,
			source: "builtin" as const,
		}),
		resolveEmbedder: async (tenantId: string) => ({
			tenantId,
			embedder,
			source: "builtin" as const,
		}),
		invalidate: () => {},
	}
}
