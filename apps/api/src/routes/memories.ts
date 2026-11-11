import { zValidator } from "@hono/zod-validator"
import type { MemoryCore } from "@repo/core"
import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../auth.ts"
import { prepareText } from "../prepare.ts"

const saveInput = z.object({
	text: z.string().min(1).max(50_000),
	userId: z.string().max(200).optional(),
	sessionId: z.string().max(200).optional(),
	source: z.enum(["text", "voice"]).default("text"),
	metadata: z.record(z.unknown()).optional(),
})

const deleteParams = z.object({ id: z.string().min(1) })

export function memoriesRouter(core: MemoryCore) {
	return new Hono()
		.post("/", zValidator("json", saveInput), async (c) => {
			const { tenantId } = auth(c)
			const body = c.req.valid("json")

			const prepared = prepareText(body.text)
			if (prepared.skip) {
				return c.json({ memories: [], skipped: prepared.skip })
			}

			const memories = await core.save({
				tenantId,
				...body,
				text: prepared.text,
				metadata: { ...(body.metadata ?? {}), ...prepared.metadata },
			})
			return c.json({ memories })
		})
		.delete("/:id", zValidator("param", deleteParams), async (c) => {
			const { tenantId } = auth(c)
			const { id } = c.req.valid("param")
			await core.forget(tenantId, id)
			return c.body(null, 204)
		})
}
