import { z } from "zod"

const schema = z
	.object({
		STORE: z.enum(["supabase", "memory"]).default("supabase"),
		DATABASE_URL: z.string().optional(),
		PORT: z.coerce.number().default(8787),
		// "local" (default): free in-process multilingual model, no API key.
		// "openai": any /v1/embeddings-compatible host. "hash": test stub only.
		EMBEDDER: z.enum(["local", "openai", "hash"]).default("local"),
		LOCAL_EMBED_MODEL: z.string().default("Xenova/multilingual-e5-small"),
		MODEL_CACHE_DIR: z.string().default(".smaran/models"),
		// "local" (default): free in-process cross-encoder reranks English
		// recall (+17 pts hit@1 on LoCoMo, ~70 ms). "none": skip reranking.
		RERANKER: z.enum(["local", "none"]).default("local"),
		RERANK_MODEL: z.string().default("Xenova/ms-marco-MiniLM-L-6-v2"),
		// Candidates the reranker re-orders (more = slower, little gain past 20).
		RERANK_POOL: z.coerce.number().int().min(1).max(100).default(20),
		OPENAI_API_KEY: z.string().optional(),
		OPENAI_BASE_URL: z.string().optional(),
		OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
		CORS_ORIGIN: z.string().default("*"),
		// Where rate limits, voice turn buffers and live events live.
		// "auto" = postgres when STORE=supabase (multi-instance safe), else memory.
		SHARED_STATE: z.enum(["auto", "postgres", "memory"]).default("auto"),
		// Direct (session-mode) connection for LISTEN/NOTIFY. Transaction
		// poolers (Supabase :6543) don't support LISTEN. Defaults to DATABASE_URL.
		EVENTS_DATABASE_URL: z.string().optional(),
		// Requests per minute per API key (token bucket, per process).
		RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(600),
		// Before auth, per client IP — blunts floods of invalid keys.
		RATE_LIMIT_PER_IP_PER_MINUTE: z.coerce
			.number()
			.int()
			.positive()
			.default(1200),
		// Self-serve signup: "off" (default), "invite" (single-use codes from
		// `bun run keys invite:create`), or "open". Persistent mode only.
		SIGNUP_MODE: z.enum(["off", "invite", "open"]).default("off"),
		SIGNUP_PER_IP_PER_MINUTE: z.coerce.number().int().positive().default(3),
		FREE_MEMORY_QUOTA: z.coerce.number().int().positive().default(10_000),
		FREE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
		MAX_BODY_BYTES: z.coerce
			.number()
			.int()
			.positive()
			.default(256 * 1024),
		SANDBOX_API_KEY: z.string().default("sk_local_dev"),
	})
	.refine(
		(e) =>
			e.STORE === "memory" || (e.DATABASE_URL && e.DATABASE_URL.length > 0),
		{
			message: "DATABASE_URL required when STORE=supabase",
			path: ["DATABASE_URL"],
		},
	)

export type Env = z.infer<typeof schema>

/** Parse and validate configuration; throws on invalid input (tests build envs with this). */
export function parseEnv(input: Record<string, string | undefined>): Env {
	const parsed = schema.safeParse(input)
	if (!parsed.success) {
		throw new Error(
			`invalid configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
		)
	}
	return parsed.data
}

export function loadEnv(): Env {
	try {
		return parseEnv(process.env)
	} catch (err) {
		console.error(err instanceof Error ? err.message : err)
		process.exit(1)
	}
}
