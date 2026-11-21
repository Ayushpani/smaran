# `@smaranai/adapter-mastra`

Memory tools for [Mastra](https://mastra.ai), made with Mastra's own `createTool` and Zod schemas. Tested against `@mastra/core` 1.x, including a full `Agent.generate` tool loop.

```ts
import { Agent } from "@mastra/core/agent"
import { Smaran } from "@smaranai/sdk-ts"
import { memoryTools } from "@smaranai/adapter-mastra"

const memory = new Smaran({
	apiKey: process.env.SMARAN_API_KEY!,
	baseUrl: process.env.SMARAN_URL,
})

const agent = new Agent({
	id: "assistant",
	name: "assistant",
	instructions: "Save facts the user shares; recall before answering.",
	model: "openai/gpt-4o-mini",
	tools: memoryTools(memory, { userId: "u_123", sessionId: "sess_abc" }),
})
```

`@mastra/core` and `zod` are peer dependencies.
