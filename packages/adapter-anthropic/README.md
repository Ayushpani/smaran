# `@smaranai/adapter-anthropic`

Memory tools + auto-context helpers for the Anthropic Messages API (Claude
Sonnet, Opus, Haiku) and the Claude Agent SDK. No SDK wrapping — the adapter
returns tool definitions and messages you pass straight into your own
`anthropic.messages.create({...})` calls.

## Model-driven memory (tool use)

```ts
import Anthropic from "@anthropic-ai/sdk"
import { Smaran } from "@smaranai/sdk-ts"
import { handleToolUse, memoryTools } from "@smaranai/adapter-anthropic"

const anthropic = new Anthropic()
const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })
const scope = { userId: "u_123", sessionId: "sess_abc" }

const res = await anthropic.messages.create({
	model: "claude-sonnet-…",
	max_tokens: 1024,
	tools: memoryTools(),
	messages: [{ role: "user", content: "Remember I prefer window seats." }],
})

for (const block of res.content) {
	if (block.type === "tool_use") {
		const toolResult = await handleToolUse(memory, block, scope)
		// pass toolResult back as a user message in the next turn
	}
}
```

## Auto-context (silent recall)

```ts
import { withRecalledContext } from "@smaranai/adapter-anthropic"

const { system, messages } = await withRecalledContext(
	memory,
	{
		system: "You are a helpful assistant.",
		messages: [{ role: "user", content: "book me a flight to Delhi" }],
	},
	{ sessionId: "sess_abc", topK: 5 },
)
const res = await anthropic.messages.create({
	model,
	max_tokens: 1024,
	system,
	messages,
})
```

The two patterns compose — declare `memoryTools()` for model-initiated writes
_and_ call `withRecalledContext()` for silent reads on the same turn.
