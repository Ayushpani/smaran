import type { MemoryCore } from "@repo/core"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { auth } from "../auth.ts"

export function sessionsRouter(core: MemoryCore) {
	return new Hono().get("/:id/subscribe", (c) => {
		const { tenantId } = auth(c)
		const sessionId = c.req.param("id")
		const events = core.subscribe(tenantId, sessionId)
		const iterator = events[Symbol.asyncIterator]()
		return streamSSE(c, async (stream) => {
			// Client disconnect → close the subscription so the listener is freed.
			stream.onAbort(() => {
				void iterator.return?.()
			})
			for await (const event of { [Symbol.asyncIterator]: () => iterator }) {
				await stream.writeSSE({
					event: event.type,
					data: JSON.stringify(event),
				})
			}
		})
	})
}
