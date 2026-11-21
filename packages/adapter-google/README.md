# `@smaranai/adapter-google`

Memory tools + auto-context for Google Gemini (`@google/genai`; tested against 3.x). Declarations use `parametersJsonSchema`.

## Model-driven memory (function calling)

```ts
import { GoogleGenAI } from "@google/genai"
import { Smaran } from "@smaranai/sdk-ts"
import {
	handleFunctionCall,
	isMemoryFunctionCall,
	memoryTools,
} from "@smaranai/adapter-google"

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })
const scope = { userId: "u_123", sessionId: "sess_abc" }

const res = await ai.models.generateContent({
	model: "gemini-…",
	contents: [
		{ role: "user", parts: [{ text: "Remember I prefer window seats." }] },
	],
	config: { tools: memoryTools() },
})

const parts = await Promise.all(
	(res.functionCalls ?? [])
		.filter(isMemoryFunctionCall)
		.map((call) => handleFunctionCall(memory, call, scope)),
)
// next turn: [...contents, res.candidates[0].content, { role: "user", parts }]
```

## Auto-context (silent recall)

```ts
import { withRecalledContext } from "@smaranai/adapter-google"

const { systemInstruction, contents } = await withRecalledContext(
	memory,
	{
		systemInstruction: "You are a helpful assistant.",
		contents: [
			{ role: "user", parts: [{ text: "book me a flight to Delhi" }] },
		],
	},
	{ sessionId: "sess_abc", topK: 5 },
)
const res = await ai.models.generateContent({
	model,
	contents,
	config: { systemInstruction },
})
```
