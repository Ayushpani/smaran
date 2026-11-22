# `@smaranai/adapter-vapi`

Memory for [Vapi](https://vapi.ai) voice agents. Handles the server-URL
webhook shape: function calls become memory ops, live transcripts flow into
a `StreamingSession`, and the response body is exactly what Vapi expects.

## Wire it up

```ts
import { Hono } from "hono"
import { Smaran } from "@smaranai/sdk-ts"
import { HotCache, StreamingSession } from "@repo/voice"
import { handleVapiEvent, memoryFunctions } from "@smaranai/adapter-vapi"

const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })
const cache = new HotCache({ ttlMs: 60_000 })
const sessions = new Map<string, StreamingSession>()

const app = new Hono()
app.post("/vapi", async (c) => {
	const body = await c.req.json()
	const callId: string = body.message?.call?.id ?? "unknown"
	const userId: string | undefined = body.message?.call?.customer?.number

	let session = sessions.get(callId)
	if (!session) {
		session = new StreamingSession({
			sessionId: callId,
			userId,
			client: memory,
			cache,
		})
		sessions.set(callId, session)
	}

	const result = await handleVapiEvent(body.message, {
		memory,
		session,
		sessionId: callId,
		userId,
	})
	if (result.response) return c.json(result.response)
	return c.body(null, 204)
})
```

In the Vapi dashboard, add the two functions from `memoryFunctions()` to the
assistant so the model can save and recall memories itself. Silent-context
users can compose `withRecalledContext` from an LLM adapter on top.
