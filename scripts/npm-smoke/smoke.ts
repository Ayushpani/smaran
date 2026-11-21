import { Smaran, SmaranError } from "@smaranai/sdk-ts"
import * as anthropic from "@smaranai/adapter-anthropic"
import * as openai from "@smaranai/adapter-openai"
import * as google from "@smaranai/adapter-google"
import * as vercel from "@smaranai/adapter-vercel-ai"
import * as langgraph from "@smaranai/adapter-langgraph"
import * as mastra from "@smaranai/adapter-mastra"
import * as vapi from "@smaranai/adapter-vapi"
import * as livekit from "@smaranai/adapter-livekit"
import { generateText, stepCountIs } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { ToolNode } from "@langchain/langgraph/prebuilt"
import { AIMessage, type ToolMessage } from "@langchain/core/messages"

const smaran = new Smaran({
	apiKey: "sk_local_dev",
	baseUrl: "http://localhost:8779",
})
const scope = { userId: "npm_smoke" }
const ok = (name: string, cond: boolean) => {
	console.log(`${cond ? "✓" : "✗"} ${name}`)
	if (!cond) process.exitCode = 1
}

const [m] = await smaran.save({ ...scope, text: "I live in Powai, Mumbai." })
ok(
	"sdk-ts: save + recall against the real API",
	(await smaran.recall({ ...scope, query: "where do I live" })).hits[0]?.memory
		.id === m!.id,
)
const err = await new Smaran({
	apiKey: "bad",
	baseUrl: "http://localhost:8779",
	maxRetries: 0,
})
	.recall({ query: "x" })
	.catch((e) => e)
ok(
	"sdk-ts: typed SmaranError",
	err instanceof SmaranError && err.code === "unauthorized",
)

ok("anthropic: tools", anthropic.memoryTools().length === 2)
ok(
	"anthropic: recalled system prompt",
	(
		await anthropic.withRecalledContext(
			smaran,
			{ messages: [{ role: "user", content: "where do I live" }] },
			scope,
		)
	).system.includes("Powai"),
)
ok(
	"openai: tool call",
	(
		await openai.handleToolCall(
			smaran,
			{
				id: "1",
				type: "function",
				function: { name: "memory_recall", arguments: '{"query":"home city"}' },
			},
			scope,
		)
	).content.includes("Powai"),
)
ok(
	"google: function call",
	(
		await google.handleFunctionCall(
			smaran,
			{ name: "memory_recall", args: { query: "home" } },
			scope,
		)
	).functionResponse.response.output.includes("Powai"),
)

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
}
const model = new MockLanguageModelV4({
	doGenerate: [
		{
			content: [
				{
					type: "tool-call",
					toolCallId: "c",
					toolName: "memory_recall",
					input: '{"query":"home"}',
				},
			],
			finishReason: { unified: "tool-calls", raw: "tool_calls" },
			usage,
			warnings: [],
		},
		{
			content: [{ type: "text", text: "Powai." }],
			finishReason: { unified: "stop", raw: "stop" },
			usage,
			warnings: [],
		},
	] as never,
})
const gen = await generateText({
	model,
	prompt: "where?",
	tools: vercel.memoryTools(smaran, scope),
	stopWhen: stepCountIs(3),
})
ok(
	"vercel-ai: generateText tool loop via real API",
	String(gen.steps[0]!.toolResults[0]!.output).includes("Powai"),
)

const node = new ToolNode(langgraph.memoryTools(smaran, scope))
const out = (await node.invoke({
	messages: [
		new AIMessage({
			content: "",
			tool_calls: [
				{
					id: "1",
					name: "memory_recall",
					args: { query: "home" },
					type: "tool_call",
				},
			],
		}),
	],
})) as { messages: ToolMessage[] }
ok(
	"langgraph: ToolNode via real API",
	String(out.messages[0]!.content).includes("Powai"),
)
ok(
	"mastra: createTool via real API",
	String(
		await mastra.memoryTools(smaran, scope).memory_recall.execute!(
			{ query: "home" },
			{} as never,
		),
	).includes("Powai"),
)
ok(
	"vapi: function-call event",
	JSON.stringify(
		(
			await vapi.handleVapiEvent(
				{
					type: "function-call",
					functionCall: {
						name: "memory_recall",
						parameters: { query: "home" },
					},
				},
				{ memory: smaran, ...scope },
			)
		).response,
	).includes("Powai"),
)
const lk = new livekit.LiveKitVoiceAdapter({
	memory: smaran,
	sessionId: "lk",
	userId: "npm_smoke",
})
ok(
	"livekit: context prefix",
	(await lk.buildContextPrefix("where do I live")).includes("Powai"),
)
