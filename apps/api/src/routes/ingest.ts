import { validate } from "../http.ts"
import type { MemoryCore } from "@repo/core"
import { isSubstantive, scrubAsrText } from "@repo/voice"
import { Hono } from "hono"
import { z } from "zod"
import type { IngestBuffers } from "@repo/db"
import { auth } from "../auth.ts"
import { prepareText } from "../prepare.ts"

/**
 * Streaming-ingest endpoints for voice agents.
 *  - POST /partial → append token-level partial transcript, no persist.
 *  - POST /commit  → finalize the current turn, scrub, save.
 * The API keeps per-session buffers in memory so the caller can be
 * a stateless webhook (Vapi, Retell, LiveKit egress).
 */

export const partialInput = z.object({
	sessionId: z.string().min(1).max(200),
	userId: z.string().max(200).optional(),
	text: z.string().min(1).max(4_000),
})

export const commitInput = z.object({
	sessionId: z.string().min(1).max(200),
	userId: z.string().max(200).optional(),
	text: z.string().max(4_000).optional(),
	source: z.enum(["text", "voice"]).default("voice"),
})

/** Single-process turn buffers (sandbox / single instance). Same merge rule as the Postgres store. */
export function createMemoryIngestBuffers(): IngestBuffers {
	const map = new Map<string, string>()
	const k = (t: string, s: string) => `${t}\u0000${s}`
	return {
		async append(t, s, text) {
			const prev = map.get(k(t, s)) ?? ""
			const next =
				!prev || text.startsWith(prev)
					? text
					: prev.endsWith(text)
						? prev
						: `${prev} ${text}`
			map.set(k(t, s), next)
			return next.length
		},
		async take(t, s) {
			const cur = map.get(k(t, s)) ?? ""
			map.delete(k(t, s))
			return cur
		},
		async stats(t) {
			let n = 0
			for (const key of map.keys()) if (key.startsWith(`${t}\u0000`)) n++
			return { sessions: n }
		},
	}
}

export function ingestRouter(
	core: MemoryCore,
	buffers: IngestBuffers = createMemoryIngestBuffers(),
) {
	return new Hono()
		.post("/partial", validate("json", partialInput), async (c) => {
			const { tenantId } = auth(c)
			const { sessionId, text } = c.req.valid("json")
			const bufferLen = await buffers.append(tenantId, sessionId, text)
			return c.json({ sessionId, bufferLen })
		})
		.post("/commit", validate("json", commitInput), async (c) => {
			const { tenantId } = auth(c)
			const body = c.req.valid("json")
			// Always clear the turn buffer, even when `text` is passed
			// explicitly — otherwise stale partials leak into the next turn.
			const buffered = await buffers.take(tenantId, body.sessionId)
			const raw = (body.text ?? buffered).trim()
			if (!raw) return c.json({ saved: false, reason: "empty" })
			const scrubbed = scrubAsrText(raw)
			if (!isSubstantive(scrubbed.text)) {
				return c.json({
					saved: false,
					reason: "not-substantive",
					text: scrubbed.text,
				})
			}
			const prepared = prepareText(scrubbed.text)
			if (prepared.skip) {
				return c.json({
					saved: false,
					reason: prepared.skip,
					text: scrubbed.text,
				})
			}
			const memories = await core.save({
				tenantId,
				userId: body.userId ?? null,
				sessionId: body.sessionId,
				text: prepared.text,
				source: body.source,
				metadata: { ...prepared.metadata, asrFillersRemoved: scrubbed.removed },
			})
			return c.json({ saved: true, memories, text: prepared.text })
		})
		.get("/stats", async (c) => c.json(await buffers.stats(auth(c).tenantId)))
}
