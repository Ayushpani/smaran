import { zValidator } from "@hono/zod-validator"
import type { MemoryCore } from "@repo/core"
import { isSubstantive, scrubAsrText } from "@repo/voice"
import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../auth.ts"
import { prepareText } from "../prepare.ts"

/**
 * Streaming-ingest endpoints for voice agents.
 *  - POST /partial → append token-level partial transcript, no persist.
 *  - POST /commit  → finalize the current turn, scrub, save.
 * The API keeps per-session buffers in memory so the caller can be
 * a stateless webhook (Vapi, Retell, LiveKit egress).
 */

const partialInput = z.object({
	sessionId: z.string().min(1).max(200),
	userId: z.string().max(200).optional(),
	text: z.string().min(1).max(4_000),
})

const commitInput = z.object({
	sessionId: z.string().min(1).max(200),
	userId: z.string().max(200).optional(),
	text: z.string().max(4_000).optional(),
	source: z.enum(["text", "voice"]).default("voice"),
})

interface Buffers {
	get(key: string): string | undefined
	append(key: string, text: string): string
	take(key: string): string
	stats(): { sessions: number }
}

function createBuffers(): Buffers {
	const map = new Map<string, string>()
	return {
		get: (k) => map.get(k),
		append(k, text) {
			const prev = map.get(k) ?? ""
			const next = text.startsWith(prev)
				? text
				: prev.endsWith(text)
					? prev
					: `${prev} ${text}`
			map.set(k, next)
			return next
		},
		take(k) {
			const cur = map.get(k) ?? ""
			map.delete(k)
			return cur
		},
		stats: () => ({ sessions: map.size }),
	}
}

export function ingestRouter(core: MemoryCore) {
	const buffers = createBuffers()
	const key = (tenantId: string, sessionId: string) =>
		`${tenantId}:${sessionId}`

	return new Hono()
		.post("/partial", zValidator("json", partialInput), (c) => {
			const { tenantId } = auth(c)
			const { sessionId, text } = c.req.valid("json")
			const merged = buffers.append(key(tenantId, sessionId), text)
			return c.json({ sessionId, bufferLen: merged.length })
		})
		.post("/commit", zValidator("json", commitInput), async (c) => {
			const { tenantId } = auth(c)
			const body = c.req.valid("json")
			const bufKey = key(tenantId, body.sessionId)
			const raw = (body.text ?? buffers.take(bufKey)).trim()
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
		.get("/stats", (c) => c.json(buffers.stats()))
}
