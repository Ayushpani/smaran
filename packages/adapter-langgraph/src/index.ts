import {
	type AdapterScope,
	type AutoRecallOptions,
	buildRecalledContext,
	handleMemoryToolCall,
	type MemoryClient,
	memoryToolSpecs,
} from "@repo/core"
import { type BaseMessage, SystemMessage } from "@langchain/core/messages"
import { tool } from "@langchain/core/tools"

/**
 * LangGraph.js / LangChain.js integration (tested against @langchain/core
 * 1.x and @langchain/langgraph 1.x).
 *
 *   memoryTools(memory, scope)  — LangChain tools for `ToolNode`,
 *                                 `createReactAgent`, or `model.bindTools`.
 *   withRecalledContext(memory, messages, opts) — prepend recalled
 *                                 memories as a SystemMessage (use it in a
 *                                 node or as createReactAgent's `prompt`).
 */
export function memoryTools(client: MemoryClient, scope: AdapterScope) {
	return memoryToolSpecs.map((spec) =>
		tool(
			async (input: Record<string, unknown>) => {
				const res = await handleMemoryToolCall(
					client,
					{ name: spec.name, input },
					scope,
				)
				return res.content
			},
			{
				name: spec.name,
				description: spec.description,
				schema: spec.parameters,
			},
		),
	)
}

/**
 * Recall against the last human message and return the messages with a
 * SystemMessage of recalled memories in front (merged into an existing
 * leading SystemMessage). Unchanged when nothing matches.
 */
export async function withRecalledContext(
	client: MemoryClient,
	messages: BaseMessage[],
	opts: AutoRecallOptions = {},
): Promise<BaseMessage[]> {
	const last = [...messages].reverse().find((m) => m.getType() === "human")
	const recalled = await buildRecalledContext(
		client,
		last ? last.text : "",
		opts,
	)
	if (!recalled) return messages
	const [head, ...rest] = messages
	if (head && head.getType() === "system") {
		return [new SystemMessage(`${head.text}\n\n${recalled}`), ...rest]
	}
	return [new SystemMessage(recalled), ...messages]
}
