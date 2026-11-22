import { smaranFromEnv } from "@/lib/playground/agent"
import { validVisitor } from "@/lib/playground/limits"
import { PERSONAS } from "@/lib/playground/personas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Erase everything the playground stored for this visitor, for every agent. */
export async function POST(req: Request) {
	const smaran = smaranFromEnv()
	if (!smaran)
		return Response.json({ error: "Not connected." }, { status: 503 })
	const body = (await req.json().catch(() => null)) as {
		visitor?: unknown
	} | null
	if (!validVisitor(body?.visitor))
		return Response.json({ error: "Bad request." }, { status: 400 })
	try {
		await Promise.all(
			PERSONAS.map((p) => smaran.forgetUser(`pg-${body.visitor}-${p.id}`)),
		)
		return Response.json({ erased: true })
	} catch (e) {
		console.error(
			"playground erase failed:",
			e instanceof Error ? e.message : e,
		)
		return Response.json(
			{ error: "Couldn't erase right now. Try again." },
			{ status: 502 },
		)
	}
}
