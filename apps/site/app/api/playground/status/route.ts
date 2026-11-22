import { llmFromEnv, smaranFromEnv } from "@/lib/playground/agent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
	const llm = llmFromEnv()
	return Response.json(
		{ live: !!smaranFromEnv() && !!llm, model: llm?.model ?? null },
		{ headers: { "Cache-Control": "no-store" } },
	)
}
