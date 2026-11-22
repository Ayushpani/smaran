import { createOpenAIEmbedder, HashEmbedder, type Embedder } from "@repo/core"
import { schema, type Db } from "@repo/db"
import {
	createHttpReranker,
	HeuristicReranker,
	type Reranker,
} from "@repo/models"
import { and, desc, eq, isNull, or } from "drizzle-orm"

/**
 * Resolves the reranker AND embedder each tenant is currently bound to
 * (the model_registry table's `role` enum has always included
 * "embedder" — resolution for it was simply never implemented). Falls
 * back to the platform default row (tenant_id NULL) then to a built-in
 * default when no row exists. Cached in-process per tenant with a short
 * TTL so the hot save/recall path never round-trips to Postgres for
 * this.
 */

export interface ResolvedRerankers {
	tenantId: string
	/** null when no reranker is configured (RERANKER=none and no registry row). */
	reranker: Reranker | null
	source: "tenant" | "platform" | "builtin"
}

export interface ResolvedEmbedder {
	tenantId: string
	embedder: Embedder
	source: "tenant" | "platform" | "builtin"
}

interface RerankerConfig {
	url?: string
	model?: string
	apiKey?: string
}

interface EmbedderConfig {
	apiKey?: string
	model?: string
	dim?: number
	baseUrl?: string
}

interface CacheEntry<T> {
	value: T
	expiresAt: number
}

const TTL_MS = 30_000

async function resolveRow(
	db: Db,
	role: "reranker" | "embedder",
	tenantId: string,
) {
	const rows = await db
		.select()
		.from(schema.modelRegistry)
		.where(
			and(
				eq(schema.modelRegistry.role, role),
				or(
					eq(schema.modelRegistry.tenantId, tenantId),
					isNull(schema.modelRegistry.tenantId),
				),
			),
		)
		.orderBy(desc(schema.modelRegistry.tenantId))

	return (
		rows.find((r) => r.activatedAt !== null && r.tenantId === tenantId) ??
		rows.find((r) => r.activatedAt !== null && r.tenantId === null)
	)
}

export function createModelResolver(db: Db, builtInReranker: Reranker | null) {
	const rerankerCache = new Map<string, CacheEntry<ResolvedRerankers>>()
	const embedderCache = new Map<string, CacheEntry<ResolvedEmbedder>>()
	const builtInEmbedder = new HashEmbedder()

	async function resolve(tenantId: string): Promise<ResolvedRerankers> {
		const now = Date.now()
		const cached = rerankerCache.get(tenantId)
		if (cached && cached.expiresAt > now) return cached.value

		const active = await resolveRow(db, "reranker", tenantId)

		let reranker: Reranker | null = builtInReranker
		let source: ResolvedRerankers["source"] = "builtin"
		if (active) {
			source = active.tenantId === tenantId ? "tenant" : "platform"
			const cfg = (active.config as RerankerConfig) ?? {}
			if (active.provider === "http" && cfg.url && cfg.model) {
				reranker = createHttpReranker({
					url: cfg.url,
					model: cfg.model,
					apiKey: cfg.apiKey,
				})
			} else if (active.provider === "heuristic") {
				reranker = new HeuristicReranker()
			} else if (active.provider === "builtin") {
				reranker = builtInReranker
			}
		}

		const value: ResolvedRerankers = { tenantId, reranker, source }
		rerankerCache.set(tenantId, { value, expiresAt: now + TTL_MS })
		return value
	}

	async function resolveEmbedder(tenantId: string): Promise<ResolvedEmbedder> {
		const now = Date.now()
		const cached = embedderCache.get(tenantId)
		if (cached && cached.expiresAt > now) return cached.value

		const active = await resolveRow(db, "embedder", tenantId)

		let embedder: Embedder = builtInEmbedder
		let source: ResolvedEmbedder["source"] = "builtin"
		if (active) {
			source = active.tenantId === tenantId ? "tenant" : "platform"
			const cfg = (active.config as EmbedderConfig) ?? {}
			if (active.provider === "openai" && cfg.apiKey) {
				embedder = createOpenAIEmbedder({
					apiKey: cfg.apiKey,
					model: cfg.model,
					dim: cfg.dim,
					baseUrl: cfg.baseUrl,
				})
			} else if (active.provider === "builtin") {
				embedder = builtInEmbedder
			}
		}

		const value: ResolvedEmbedder = { tenantId, embedder, source }
		embedderCache.set(tenantId, { value, expiresAt: now + TTL_MS })
		return value
	}

	function invalidate(tenantId: string) {
		rerankerCache.delete(tenantId)
		embedderCache.delete(tenantId)
	}

	return { resolve, resolveEmbedder, invalidate }
}

export type ModelResolver = ReturnType<typeof createModelResolver>
