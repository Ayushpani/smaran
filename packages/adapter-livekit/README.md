# `@smaranai/adapter-livekit`

Memory for [LiveKit Agents](https://docs.livekit.io/agents/). Wraps the
`StreamingSession` in a shape you plug into LiveKit's voice-pipeline hooks.
Works for Pipecat and any other agent runtime that emits partial + final
transcript events plus function calls.

```ts
import { Smaran } from "@smaranai/sdk-ts"
import { LiveKitVoiceAdapter, memoryTools } from "@smaranai/adapter-livekit"

const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })

const adapter = new LiveKitVoiceAdapter({
	memory,
	sessionId: room.name,
	userId: participant.identity,
})

// Wire the LLM's function schema:
llm.tools.push(...memoryTools())

// Wire LiveKit's transcript events:
session.on("user_transcript_updated", (t) =>
	adapter.onPartialTranscript(t.text),
)
session.on("user_turn_committed", (t) => adapter.onFinalTranscript(t.text))

// Wire the function-call hook:
llm.on("function_call", async (call) => {
	if (adapter.isMemoryFunction(call.name)) {
		const result = await adapter.handleFunctionCall(call)
		call.respond(result)
	}
})

// Or use silent recall before every LLM turn:
const context = await adapter.buildContextPrefix(userText)
system.prepend(context)
```
