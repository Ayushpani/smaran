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
		OPENAI_API_KEY: z.string().optional(),
		OPENAI_BASE_URL: z.string().optional(),
		OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
		CORS_ORIGIN: z.string().default("*"),
		// Requests per minute per API key (token bucket, per process).
		RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(600),
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

export function loadEnv(): Env {
	const parsed = schema.safeParse(process.env)
	if (!parsed.success) {
		console.error("env validation failed:", parsed.error.flatten().fieldErrors)
		process.exit(1)
	}
	return parsed.data
}
