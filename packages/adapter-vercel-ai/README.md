# `@smaranai/adapter-vercel-ai`

Vercel AI SDK plugin (AI SDK 5+, tested against 7). Drop-in tools and silent-context helpers for
`generateText`, `streamText` and agents.

```ts
import { anthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { Smaran } from "@smaranai/sdk-ts"
import { memoryTools, withRecalledContext } from "@smaranai/adapter-vercel-ai"

const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })
const scope = { userId: "u_123", sessionId: "sess_abc" }

// Silent recall + tools composed on the same call
const res = await generateText({
	model: anthropic("claude-…"),
	tools: memoryTools(memory, scope),
	messages: await withRecalledContext(
		memory,
		[{ role: "user", content: "book me a flight to Delhi" }],
		{ ...scope, topK: 5 },
	),
})
```

`memoryTools` returns `{ memory_save, memory_recall }` built with the SDK's own
`tool()` and `jsonSchema()` (`ai` is a peer dependency). Each tool's `execute` calls into `@repo/core`'s tool
handler, so the SDK's tool-use loop just works.
