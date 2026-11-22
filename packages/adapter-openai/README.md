# `@smaranai/adapter-openai`

Memory tools + auto-context for OpenAI Chat Completions, Responses, the
OpenAI Agents SDK, the Codex CLI, and every OpenAI-compatible provider —
Groq, Together, DeepSeek, xAI, Fireworks, Ollama, LM Studio, vLLM. The wire
format is identical; point your client's `baseURL` at whichever one you use.

## Model-driven memory (tool use)

```ts
import OpenAI from "openai"
import { Smaran } from "@smaranai/sdk-ts"
import { handleToolCall, memoryTools } from "@smaranai/adapter-openai"

const openai = new OpenAI() // or baseURL: "https://api.groq.com/openai/v1", etc.
const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })
const scope = { userId: "u_123", sessionId: "sess_abc" }

const res = await openai.chat.completions.create({
	model: "gpt-…",
	tools: memoryTools(),
	messages: [{ role: "user", content: "Remember I prefer window seats." }],
})

const msg = res.choices[0].message
for (const call of msg.tool_calls ?? []) {
	const toolMessage = await handleToolCall(memory, call, scope)
	// append toolMessage to your next request
}
```

## Auto-context (silent recall)

```ts
import { withRecalledContext } from "@smaranai/adapter-openai"

const augmented = await withRecalledContext(
	memory,
	[
		{ role: "system", content: "You are a helpful assistant." },
		{ role: "user", content: "book me a flight to Delhi" },
	],
	{ sessionId: "sess_abc", topK: 5 },
)

const res = await openai.chat.completions.create({ model, messages: augmented })
```

Compose both patterns on the same call — tools for model-initiated writes,
`withRecalledContext` for silent reads.
