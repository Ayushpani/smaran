import { schema, type Db } from "@repo/db"
import { count, eq } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import type { AuthContext } from "./auth.ts"

/**
 * Memory quota per tenant (plan limit). Counts are cached per tenant for
 * COUNT_TTL_MS and bumped locally on each save, so enforcing a quota
 * doesn't add a COUNT(*) to every write. Across instances the check is
 * approximate by at most one TTL's worth of writes — fine for a plan cap.
 */
const COUNT_TTL_MS = 30_000

export interface QuotaGuard {
	/** Throws 402 quota_exceeded when the tenant is at its memory quota. */
	beforeSave(auth: AuthContext): Promise<void>
	afterSave(auth: AuthContext, saved: number): void
	memoryCount(tenantId: string): Promise<number>
}

export function createQuotaGuard(db: Db | undefined): QuotaGuard {
	const counts = new Map<string, { n: number; at: number }>()
	async function memoryCount(tenantId: string): Promise<number> {
		if (!db) return 0
		const cached = counts.get(tenantId)
		if (cached && Date.now() - cached.at < COUNT_TTL_MS) return cached.n
		const [row] = await db
			.select({ n: count() })
			.from(schema.memories)
			.where(eq(schema.memories.tenantId, tenantId))
		const n = Number(row?.n ?? 0)
		counts.set(tenantId, { n, at: Date.now() })
		return n
	}
	return {
		memoryCount,
		async beforeSave(auth) {
			if (auth.memoryQuota == null) return
			if ((await memoryCount(auth.tenantId)) >= auth.memoryQuota) {
				throw new HTTPException(402, {
					message: `memory quota reached (${auth.memoryQuota} on the ${auth.plan ?? "current"} plan)`,
				})
			}
		},
		afterSave(auth, saved) {
			const c = counts.get(auth.tenantId)
			if (c) c.n += saved
		},
	}
}
