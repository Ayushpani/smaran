import {
	type AdapterScope,
	handleMemoryToolCall,
	type MemoryClient,
	MEMORY_TOOL_NAMES,
} from "@repo/core"
import { createTool } from "@mastra/core/tools"
import { z } from "zod"

/**
 * Mastra integration (tested against @mastra/core 1.x). Returns tools made
 * with Mastra's own `createTool` and Zod schemas, ready for
 * `new Agent({ tools: memoryTools(memory, scope) })`.
 */
export function memoryTools(client: MemoryClient, scope: AdapterScope) {
	return {
		[MEMORY_TOOL_NAMES.save]: createTool({
			id: MEMORY_TOOL_NAMES.save,
			description:
				"Persist a fact, preference, event, or entity the user has revealed, so it can be recalled in future turns and sessions. Save concise, self-contained statements — not the whole message.",
			inputSchema: z.object({
				text: z.string().describe("The self-contained fact to remember."),
			}),
			execute: async (input) =>
				(
					await handleMemoryToolCall(
						client,
						{ name: MEMORY_TOOL_NAMES.save, input },
						scope,
					)
				).content,
		}),
		[MEMORY_TOOL_NAMES.recall]: createTool({
			id: MEMORY_TOOL_NAMES.recall,
			description:
				"Search prior memories for anything relevant to the current turn. Use liberally — recall is cheap and helps avoid asking the user for information they already provided.",
			inputSchema: z.object({
				query: z.string().describe("A short query capturing what to recall."),
				topK: z
					.number()
					.optional()
					.describe("Max number of hits to return. Defaults to 5."),
			}),
			execute: async (input) =>
				(
					await handleMemoryToolCall(
						client,
						{ name: MEMORY_TOOL_NAMES.recall, input },
						scope,
					)
				).content,
		}),
	}
}
