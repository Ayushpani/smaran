import { validate } from "../http.ts"
import { consolidateProfile } from "@repo/core"
import { createProfileStore, type Db } from "@repo/db"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { auth } from "../auth.ts"

/**
 * Per-user consolidated profile — a standing, evidence-backed summary a
 * voice agent fetches at call start with a single point-lookup instead
 * of a fresh vector search. See packages/core/src/profile.ts.
 *
 *   GET  /v1/profile?userId=...          — the current profile, if any.
 *   POST /v1/profile/consolidate         — recompute it from current memories.
 *
 * Consolidation is triggered on demand here rather than on a cron — this
 * repo has no job scheduler wired yet. A cron trigger (matching the
 * connection-import cron already in wrangler.jsonc) is a follow-up, not
 * a change to consolidateProfile()'s own logic.
 */

const userIdQuery = z.object({ userId: z.string().min(1).max(200) })

export function profileRouter(db: Db, opts: { topicSimilarity?: number } = {}) {
	const store = createProfileStore(db)

	return new Hono()
		.get("/", validate("query", userIdQuery), async (c) => {
			const { tenantId } = auth(c)
			const { userId } = c.req.valid("query")
			const profile = await store.getProfile(tenantId, userId)
			if (!profile) throw new HTTPException(404, { message: "no profile yet" })
			return c.json(profile)
		})
		.post("/consolidate", validate("query", userIdQuery), async (c) => {
			const { tenantId } = auth(c)
			const { userId } = c.req.valid("query")
			const memories = await store.fetchCurrentMemories(tenantId, userId)
			const result = consolidateProfile(
				memories,
				undefined,
				opts.topicSimilarity,
			)
			if (!result) {
				return c.json({
					consolidated: false,
					reason: "not enough recurring evidence",
				})
			}
			await store.upsertProfile(tenantId, userId, result)
			return c.json({
				consolidated: true,
				summary: result.summary,
				confidence:
					result.belief.alpha / (result.belief.alpha + result.belief.beta),
				sourceMemoryIds: result.sourceMemoryIds,
			})
		})
}
