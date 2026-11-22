import { SmaranError } from "@smaranai/sdk-ts"
import {
	type ChatMessage,
	llmFromEnv,
	runTurn,
	smaranFromEnv,
} from "@/lib/playground/agent"
import { clientIp, LIMITS, take, validVisitor } from "@/lib/playground/limits"
import { personaById } from "@/lib/playground/personas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { "Cache-Control": "no-store" } })

function cleanHistory(h: unknown): ChatMessage[] {
	if (!Array.isArray(h)) return []
	return h
		.filter(
			(m): m is ChatMessage =>
				!!m &&
				(m.role === "user" || m.role === "assistant") &&
				typeof m.content === "string",
		)
		.slice(-10)
		.map((m) => ({ role: m.role, content: m.content.slice(0, 600) }))
}

/**
 * One turn for both agents: the one with Smaran memory and, if asked,
 * the same agent without memory, so the difference is side by side.
 */
export async function POST(req: Request) {
	const smaran = smaranFromEnv()
	const llm = llmFromEnv()
	if (!smaran || !llm)
		return json(
			{ error: "The live playground isn't connected on this site yet." },
			503,
		)

	const body = (await req.json().catch(() => null)) as Record<
		string,
		unknown
	> | null
	const persona = personaById(String(body?.persona ?? ""))
	const visitor = body?.visitor
	const session = String(body?.session ?? "")
	const message = String(body?.message ?? "").trim()
	if (!persona || !validVisitor(visitor) || !/^[a-z0-9-]{4,60}$/.test(session))
		return json({ error: "Bad request." }, 400)
	if (message.length > LIMITS.messageChars)
		return json(
			{ error: `Keep it under ${LIMITS.messageChars} characters.` },
			400,
		)

	if (
		!take(`v:${visitor}`, LIMITS.turnsPerVisitorPerDay) ||
		!take(`ip:${clientIp(req)}`, LIMITS.turnsPerIpPerDay)
	)
		return json(
			{
				error:
					"You've used today's free playground turns. Come back tomorrow, or get a key and build your own.",
			},
			429,
		)

	const callerId = `pg-${visitor}-${persona.id}`
	const base = { persona, callerId, sessionId: session, message }
	try {
		const [withMemory, without] = await Promise.all([
			runTurn(smaran, llm, {
				...base,
				history: cleanHistory(body?.history),
				memory: true,
			}),
			body?.compare
				? runTurn(smaran, llm, {
						...base,
						history: cleanHistory(body?.twinHistory),
						memory: false,
					})
				: Promise.resolve(null),
		])
		return json({
			memory: withMemory,
			plain: without ? { reply: without.reply, llmMs: without.llmMs } : null,
		})
	} catch (e) {
		if (e instanceof SmaranError && e.status === 429)
			return json(
				{ error: "The playground is busy right now. Try again in a minute." },
				429,
			)
		console.error("playground turn failed:", e instanceof Error ? e.message : e)
		return json(
			{ error: "The agent couldn't answer just now. Try again." },
			502,
		)
	}
}
