# `@smaranai/adapter-langgraph`

Memory for [LangGraph.js](https://langchain-ai.github.io/langgraphjs/) and LangChain.js, built on LangChain's own `tool()`. Tested against `@langchain/core` 1.x and `@langchain/langgraph` 1.x (`ToolNode`).

```ts
import { createReactAgent } from "@langchain/langgraph/prebuilt"
import { ChatAnthropic } from "@langchain/anthropic"
import { Smaran } from "@smaranai/sdk-ts"
import { memoryTools, withRecalledContext } from "@smaranai/adapter-langgraph"

const memory = new Smaran({
	apiKey: process.env.SMARAN_API_KEY!,
	baseUrl: process.env.SMARAN_URL,
})
const scope = { userId: "u_123", sessionId: "sess_abc" }

const agent = createReactAgent({
	llm: new ChatAnthropic({ model: "claude-sonnet-4-5" }),
	tools: memoryTools(memory, scope),
	// Silent recall: memories are injected before every model call.
	prompt: (state) => withRecalledContext(memory, state.messages, scope),
})
```

- `memoryTools(memory, scope)` — `memory_save` and `memory_recall` as LangChain tools (JSON-schema inputs) for `ToolNode`, `createReactAgent` or `model.bindTools`.
- `withRecalledContext(memory, messages, opts)` — returns the messages with a `SystemMessage` of recalled memories in front (merged into an existing leading system message).

`@langchain/core` is a peer dependency.
