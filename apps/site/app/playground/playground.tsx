"use client"

import Link from "next/link"
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"
import type { ChatMessage, TurnResult } from "@/lib/playground/agent"
import { PERSONAS, type Persona } from "@/lib/playground/personas"
import { RECORDED } from "./recorded"

/* ── Types and helpers ──────────────────────────────────────────────── */

interface Turn {
	id: string
	user: string | null // null = the agent opened the call
	memory?: TurnResult
	plain?: { reply: string; llmMs: number } | null
	error?: string
	pending: boolean
}

type Phase = "idle" | "recall" | "prompt" | "reply" | "save"

const rid = (n = 12) =>
	Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) =>
		(b % 36).toString(36),
	).join("")

function store<T>(key: string, fallback: T): T {
	try {
		const v = localStorage.getItem(key)
		return v ? (JSON.parse(v) as T) : fallback
	} catch {
		return fallback
	}
}
function put(key: string, v: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(v))
	} catch {}
}

function historyOf(turns: Turn[], which: "memory" | "plain"): ChatMessage[] {
	const out: ChatMessage[] = []
	for (const t of turns) {
		if (t.user) out.push({ role: "user", content: t.user })
		const reply = which === "memory" ? t.memory?.reply : t.plain?.reply
		if (reply) out.push({ role: "assistant", content: reply })
	}
	return out
}

/* ── Browser speech ─────────────────────────────────────────────────── */

interface Recognition {
	lang: string
	interimResults: boolean
	continuous: boolean
	onresult:
		| ((e: {
				resultIndex: number
				results: ArrayLike<
					ArrayLike<{ transcript: string }> & { isFinal: boolean }
				>
		  }) => void)
		| null
	onend: (() => void) | null
	onerror: ((e: { error: string }) => void) | null
	start(): void
	stop(): void
}
function getRecognition(): Recognition | null {
	if (typeof window === "undefined") return null
	const w = window as unknown as {
		SpeechRecognition?: new () => Recognition
		webkitSpeechRecognition?: new () => Recognition
	}
	const C = w.SpeechRecognition ?? w.webkitSpeechRecognition
	return C ? new C() : null
}
function speak(text: string, lang: string) {
	if (typeof window === "undefined" || !("speechSynthesis" in window)) return
	window.speechSynthesis.cancel()
	const u = new SpeechSynthesisUtterance(text)
	u.lang = lang
	const voice = window.speechSynthesis
		.getVoices()
		.find((v) => v.lang.replace("_", "-").startsWith(lang.slice(0, 2)))
	if (voice) u.voice = voice
	u.rate = 1.05
	window.speechSynthesis.speak(u)
}

/* ── The code panel ─────────────────────────────────────────────────── */

const TS_CODE: [Phase | "none", string][] = [
	["none", 'import { Smaran } from "@smaranai/sdk-ts"'],
	["none", "const smaran = new Smaran({ apiKey, baseUrl })"],
	["none", ""],
	["none", "async function onCallerTurn(callerId: string, said: string) {"],
	["recall", "  // 1. Recall before the agent replies"],
	["recall", "  const { hits } = await smaran.recall({"],
	["recall", "    userId: callerId, query: said, topK: 5,"],
	["recall", "  })"],
	["none", ""],
	["save", "  // 2. Save what the caller said, while the model replies"],
	[
		"save",
		'  const saving = smaran.save({ userId: callerId, text: said, source: "voice" })',
	],
	["none", ""],
	["prompt", "  // 3. Put the memories in the prompt and reply"],
	["prompt", "  const memories = hits.map((h) => h.memory.text)"],
	["reply", "  const reply = await llm(systemPrompt(persona, memories), said)"],
	["save", "  await saving"],
	["none", "  return reply"],
	["none", "}"],
]
const PY_CODE = `from smaran import Smaran

memory = Smaran(api_key=api_key, base_url=base_url)

async def on_caller_turn(caller_id: str, said: str) -> str:
    # 1. Recall before the agent replies
    hits = await memory.recall(query=said, user_id=caller_id, top_k=5)

    # 2. Save what the caller said
    await memory.save(text=said, user_id=caller_id)

    # 3. Put the memories in the prompt and reply
    memories = [h.text for h in hits]
    return await llm(system_prompt(persona, memories), said)`

function CodePanel({
	phase,
	badges,
}: {
	phase: Phase
	badges: Partial<Record<Phase, string>>
}) {
	const [tab, setTab] = useState<"ts" | "py">("ts")
	const [copied, setCopied] = useState(false)
	const raw = tab === "ts" ? TS_CODE.map(([, l]) => l).join("\n") : PY_CODE
	const shownBadge = new Set<Phase>()
	return (
		<section className="pg-col pg-code" aria-labelledby="pg-code-h">
			<div className="pg-col-h">
				<h2 id="pg-code-h">The code behind it</h2>
				<div className="pg-tabs" role="tablist" aria-label="Language">
					<button
						type="button"
						role="tab"
						aria-selected={tab === "ts"}
						onClick={() => setTab("ts")}
					>
						TypeScript
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "py"}
						onClick={() => setTab("py")}
					>
						Python
					</button>
					<button
						type="button"
						className="pg-copy"
						onClick={() => {
							void navigator.clipboard
								?.writeText(raw)
								.then(() => setCopied(true))
						}}
					>
						{copied ? "Copied" : "Copy"}
					</button>
				</div>
			</div>
			<pre className="pg-pre" role="tabpanel">
				{tab === "ts" ? (
					<code>
						{TS_CODE.map(([p, line], i) => {
							const lit = p !== "none" && p === phase
							const badge =
								p !== "none" && !shownBadge.has(p) && badges[p]
									? badges[p]
									: null
							if (badge && p !== "none") shownBadge.add(p)
							return (
								// biome-ignore lint/suspicious/noArrayIndexKey: static code lines
								<span key={i} className={`pg-line${lit ? " lit" : ""}`}>
									{line || " "}
									{badge && <i className="pg-badge">{badge}</i>}
									{"\n"}
								</span>
							)
						})}
					</code>
				) : (
					<code>{PY_CODE}</code>
				)}
			</pre>
			<p className="pg-note">
				Trimmed from{" "}
				<a href="https://github.com/Ayushpani/smaran/blob/main/apps/site/lib/playground/agent.ts">
					the code running this page
				</a>
				. Vapi, LiveKit, Pipecat, OpenAI, Anthropic, Gemini and the rest wrap
				the same two calls; see <Link href="/#integrations">integrations</Link>.
			</p>
		</section>
	)
}

/* ── The page ───────────────────────────────────────────────────────── */

export function Playground() {
	const [live, setLive] = useState<boolean | null>(null)
	const [visitor, setVisitor] = useState("")
	const [pi, setPi] = useState(0)
	const persona = PERSONAS[pi]!
	const [session, setSession] = useState("")
	const [turns, setTurns] = useState<Turn[]>([])
	const [compare, setCompare] = useState(true)
	const [voice, setVoice] = useState(false)
	const [lang, setLang] = useState<string>("en-IN")
	const [listening, setListening] = useState(false)
	const [draft, setDraft] = useState("")
	const [calls, setCalls] = useState<Record<string, number>>({})
	const [saved, setSaved] = useState<Record<string, number>>({})
	const [phase, setPhase] = useState<Phase>("idle")
	const [badges, setBadges] = useState<Partial<Record<Phase, string>>>({})
	const [notice, setNotice] = useState<string | null>(null)
	const recRef = useRef<Recognition | null>(null)
	const chatRef = useRef<HTMLDivElement>(null)
	const timers = useRef<number[]>([])
	const busy = turns.some((t) => t.pending)

	// Visitor id, saved counts and the status of the live backend.
	useEffect(() => {
		let v = store<string>("smaran-visitor", "")
		if (!/^[a-z0-9]{8,40}$/.test(v)) {
			v = rid(16)
			put("smaran-visitor", v)
		}
		setVisitor(v)
		setCalls(store("smaran-pg-calls", {}))
		setSaved(store("smaran-pg-saved", {}))
		fetch("/api/playground/status")
			.then((r) => r.json())
			.then((s: { live: boolean }) => setLive(!!s.live))
			.catch(() => setLive(false))
	}, [])

	const animatePhases = useCallback(
		(m: TurnResult | undefined, opening: boolean) => {
			for (const t of timers.current) clearTimeout(t)
			timers.current = []
			if (!m) return setPhase("idle")
			const b: Partial<Record<Phase, string>> = {}
			if (m.recall)
				b.recall = `${Math.round(m.recall.serverMs?.total ?? m.recall.roundTripMs)} ms`
			b.reply = `${m.llmMs} ms`
			if (m.saved) b.save = `${m.saved.roundTripMs} ms`
			setBadges(b)
			const seq: Phase[] = opening
				? ["recall", "prompt", "reply"]
				: ["recall", "save", "prompt", "reply", "save"]
			seq.forEach((p, i) =>
				timers.current.push(window.setTimeout(() => setPhase(p), i * 520)),
			)
			timers.current.push(
				window.setTimeout(() => setPhase("idle"), seq.length * 520 + 900),
			)
		},
		[],
	)

	const send = useCallback(
		async (message: string, sessionId: string, prior: Turn[]) => {
			const id = rid(8)
			const opening = !message
			setTurns([...prior, { id, user: message || null, pending: true }])
			setPhase("recall")
			try {
				const res = await fetch("/api/playground/turn", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						persona: persona.id,
						visitor,
						session: sessionId,
						message,
						history: historyOf(prior, "memory"),
						twinHistory: historyOf(prior, "plain"),
						compare,
					}),
				})
				const data = (await res.json()) as {
					memory?: TurnResult
					plain?: Turn["plain"]
					error?: string
				}
				if (!res.ok || !data.memory)
					throw new Error(data.error ?? "Something went wrong.")
				setTurns([
					...prior,
					{
						id,
						user: message || null,
						memory: data.memory,
						plain: data.plain,
						pending: false,
					},
				])
				animatePhases(data.memory, opening)
				const n = data.memory.saved?.memories.length ?? 0
				if (n)
					setSaved((s) => {
						const next = { ...s, [persona.id]: (s[persona.id] ?? 0) + n }
						put("smaran-pg-saved", next)
						return next
					})
				if (voice) speak(data.memory.reply, lang)
			} catch (e) {
				setTurns([
					...prior,
					{
						id,
						user: message || null,
						error: e instanceof Error ? e.message : String(e),
						pending: false,
					},
				])
				setPhase("idle")
			}
		},
		[persona.id, visitor, compare, voice, lang, animatePhases],
	)

	const startCall = useCallback(() => {
		const s = `c-${rid(10)}`
		setSession(s)
		setTurns([])
		setCalls((c) => {
			const next = { ...c, [persona.id]: (c[persona.id] ?? 0) + 1 }
			put("smaran-pg-calls", next)
			return next
		})
		void send("", s, [])
	}, [persona.id, send])

	// A call starts when the page is ready, and again when the agent changes.
	const started = useRef("")
	useEffect(() => {
		if (!live || !visitor || started.current === persona.id) return
		started.current = persona.id
		setLang(persona.lang)
		startCall()
	}, [live, visitor, persona.id, persona.lang, startCall])

	useEffect(() => {
		chatRef.current?.scrollTo({
			top: chatRef.current.scrollHeight,
			behavior: "smooth",
		})
	}, [turns])

	const submit = (e?: FormEvent) => {
		e?.preventDefault()
		const m = draft.trim()
		if (!m || busy || !live) return
		setDraft("")
		void send(m, session, turns)
	}

	const toggleMic = () => {
		if (listening) {
			recRef.current?.stop()
			return
		}
		const rec = getRecognition()
		if (!rec) {
			setNotice(
				"Your browser doesn’t offer speech recognition. Try Chrome, Edge or Safari, or type instead.",
			)
			return
		}
		rec.lang = lang
		rec.interimResults = true
		rec.continuous = false
		let finalText = ""
		rec.onresult = (e) => {
			let interim = ""
			for (let i = e.resultIndex; i < e.results.length; i++) {
				const r = e.results[i]!
				if (r.isFinal) finalText += r[0]!.transcript
				else interim += r[0]!.transcript
			}
			setDraft((finalText + interim).trim())
		}
		rec.onerror = (e) => {
			if (e.error === "not-allowed")
				setNotice(
					"Microphone access was blocked. Allow it in your browser, or type instead.",
				)
		}
		rec.onend = () => {
			setListening(false)
			const m = finalText.trim()
			if (m) {
				setDraft("")
				setVoice(true)
				void send(m, session, turns)
			}
		}
		recRef.current = rec
		setListening(true)
		setNotice(null)
		rec.start()
	}

	const erase = async () => {
		if (!visitor) return
		const r = await fetch("/api/playground/erase", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ visitor }),
		})
		if (r.ok) {
			setSaved({})
			setCalls({})
			put("smaran-pg-saved", {})
			put("smaran-pg-calls", {})
			setNotice("Erased. Every agent has forgotten you.")
			started.current = ""
			startCall()
		} else setNotice("Couldn’t erase just now. Try again.")
	}

	const pickPersona = (i: number) => {
		if (i === pi || busy) return
		started.current = ""
		setPi(i)
	}

	const callNo = calls[persona.id] ?? 0
	const memTurns = turns.filter((t) => t.memory)

	return (
		<div className="wrap pg">
			<header className="pg-head">
				<div>
					<h1>Talk to an agent that remembers you.</h1>
					<p>
						Say something, correct yourself, hang up, then start a new call. The
						same agent without memory answers alongside, so you can hear the
						difference.
					</p>
				</div>
				<fieldset className="pg-personas">
					<legend className="vh">Agent</legend>
					{PERSONAS.map((p, i) => (
						<button
							key={p.id}
							type="button"
							aria-pressed={i === pi}
							onClick={() => pickPersona(i)}
							disabled={busy && i !== pi}
						>
							<b>{p.name}</b>
							<span>{p.role}</span>
						</button>
					))}
				</fieldset>
			</header>

			{live === false ? (
				<Recorded />
			) : (
				<div className="pg-grid">
					{/* ── Conversation ─────────────────────────────── */}
					<section className="pg-col pg-chat" aria-labelledby="pg-chat-h">
						<div className="pg-col-h">
							<h2 id="pg-chat-h">
								{persona.name}, call {Math.max(1, callNo)}
							</h2>
							<div className="pg-controls">
								<label className="pg-switch">
									<input
										type="checkbox"
										checked={compare}
										onChange={(e) => setCompare(e.target.checked)}
									/>
									Without memory too
								</label>
								<label className="pg-switch">
									<input
										type="checkbox"
										checked={voice}
										onChange={(e) => {
											setVoice(e.target.checked)
											if (!e.target.checked) window.speechSynthesis?.cancel()
										}}
									/>
									Speak replies
								</label>
							</div>
						</div>
						<div className="pg-msgs" ref={chatRef} aria-live="polite">
							{live === null && <p className="pg-empty">Connecting</p>}
							{turns.map((t) => (
								<div key={t.id} className="pg-turn">
									{t.user && <p className="pg-you">{t.user}</p>}
									{t.pending && (
										<p className="pg-agent pending">
											{persona.name} is thinking
										</p>
									)}
									{t.error && <p className="pg-error">{t.error}</p>}
									{t.memory && (
										<div className="pg-replies">
											<p className="pg-agent">
												<span className="who">{persona.name}, with Smaran</span>
												{t.memory.reply}
											</p>
											{t.plain && (
												<p className="pg-agent plain">
													<span className="who">Same agent, no memory</span>
													{t.plain.reply}
												</p>
											)}
										</div>
									)}
								</div>
							))}
						</div>
						<form className="pg-input" onSubmit={submit}>
							<button
								type="button"
								className={`pg-mic${listening ? " on" : ""}`}
								onClick={toggleMic}
								aria-pressed={listening}
								disabled={!live || busy}
								aria-label={listening ? "Stop listening" : "Speak"}
								title={listening ? "Stop listening" : "Speak"}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<rect x="9" y="3" width="6" height="11" rx="3" />
									<path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
								</svg>
							</button>
							<input
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								placeholder={
									listening
										? "Listening"
										: `Say or type something to ${persona.name}`
								}
								maxLength={400}
								disabled={!live}
								aria-label="Your message"
							/>
							<button
								className="btn btn-ink"
								type="submit"
								disabled={!live || busy || !draft.trim()}
							>
								Send
							</button>
						</form>
						<div className="pg-hints">
							<span>Try</span>
							{(callNo > 1
								? [persona.comeBack, ...persona.hints]
								: persona.hints
							).map((h) => (
								<button
									key={h}
									type="button"
									onClick={() => setDraft(h)}
									disabled={!live}
								>
									{h}
								</button>
							))}
						</div>
						<div className="pg-actions">
							<button
								type="button"
								className="btn btn-keep btn-sm"
								onClick={startCall}
								disabled={!live || busy}
							>
								Hang up and call again
							</button>
							<select
								value={lang}
								onChange={(e) => setLang(e.target.value)}
								aria-label="Speech language"
								className="pg-lang"
							>
								<option value="en-IN">Mic: English (India)</option>
								<option value="hi-IN">Mic: हिंदी</option>
								<option value="en-US">Mic: English (US)</option>
							</select>
							<button
								type="button"
								className="pg-link"
								onClick={() => void erase()}
								disabled={!live}
							>
								Erase my demo memories
							</button>
						</div>
						{notice && (
							<p className="pg-notice" role="status">
								{notice}
							</p>
						)}
						<p className="pg-note">
							Speech is turned into text by your browser, which may send audio
							to Google or Apple. What you say is stored as demo memories on our
							server until you erase it. Don’t share anything private.
						</p>
					</section>

					{/* ── Memory, live ─────────────────────────────── */}
					<section className="pg-col pg-mem" aria-labelledby="pg-mem-h">
						<div className="pg-col-h">
							<h2 id="pg-mem-h">Memory, live</h2>
						</div>
						<div className="pg-stats">
							<div>
								<b>{saved[persona.id] ?? 0}</b>
								<span>memories saved for you</span>
							</div>
							<div>
								<b>{Math.max(1, callNo)}</b>
								<span>calls with {persona.name}</span>
							</div>
							<div>
								<b>
									{memTurns.length
										? `${Math.round(memTurns[memTurns.length - 1]!.memory!.recall?.serverMs?.total ?? 0)} ms`
										: "0 ms"}
								</b>
								<span>memory, last turn</span>
							</div>
						</div>
						<ol className="pg-events">
							{[...turns].reverse().map((t) => (
								<MemoryEvents key={t.id} turn={t} persona={persona} />
							))}
						</ol>
					</section>

					<CodePanel phase={phase} badges={badges} />
				</div>
			)}

			<section className="pg-next">
				<div>
					<h2>Build this into your own agent.</h2>
					<p>
						Same two calls, your stack. Run the sandbox locally in a minute, or
						get a key.
					</p>
				</div>
				<div className="actions">
					<Link className="btn btn-ink" href="/signup">
						Get an API key
					</Link>
					<Link className="btn btn-line" href="/docs/quickstart">
						Run it locally
					</Link>
				</div>
			</section>
		</div>
	)
}

function MemoryEvents({ turn, persona }: { turn: Turn; persona: Persona }) {
	if (turn.pending) return <li className="pg-ev pending">Recalling</li>
	const m = turn.memory
	if (!m) return null
	const opening = !turn.user
	return (
		<li className="pg-ev">
			<p className="pg-ev-h">
				{opening ? "Call started" : `You: “${turn.user}”`}
			</p>
			{m.recall && (
				<div className="pg-ev-b">
					<p className="k">
						{opening
							? `Looked up ${persona.openingQuery}`
							: "Recalled before replying"}
						,{" "}
						<b>
							{Math.round(m.recall.serverMs?.total ?? m.recall.roundTripMs)} ms
						</b>
					</p>
					{m.recall.hits.length === 0 ? (
						<p className="none">Nothing remembered yet.</p>
					) : (
						<ul>
							{m.recall.hits.slice(0, 4).map((h) => (
								<li key={h.text}>{h.text}</li>
							))}
						</ul>
					)}
				</div>
			)}
			{m.saved && (
				<div className="pg-ev-b">
					<p className="k">
						Saved, <b>{m.saved.roundTripMs} ms</b>
					</p>
					{m.saved.memories.length === 0 ? (
						<p className="none">
							Nothing stored: it was a question, or too short.
						</p>
					) : (
						m.saved.memories.map((s) => (
							<div key={s.text} className="pg-saved">
								<p className="t">{s.text}</p>
								{s.corrections.map((c) => (
									<p key={c.retracted} className="fix">
										Dropped <s>{c.retracted}</s>
									</p>
								))}
								{s.replaced && (
									<p className="fix">
										Replaced an older memory, which is kept with an end date.
									</p>
								)}
							</div>
						))
					)}
				</div>
			)}
		</li>
	)
}

/** Shown when this deployment has no live backend: an example pair of calls. */
function Recorded() {
	const [step, setStep] = useState(0)
	const shown = RECORDED.slice(0, step + 1)
	const box = useRef<HTMLDivElement>(null)
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on each new step
	useEffect(() => {
		box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" })
	}, [step])
	return (
		<div className="pg-grid pg-recorded">
			<section className="pg-col pg-chat" aria-labelledby="pg-rec-h">
				<div className="pg-col-h">
					<h2 id="pg-rec-h">An example of two calls</h2>
				</div>
				<p className="pg-note">
					The live playground isn’t connected on this site yet. Here is an
					example of two calls with Asha at Sunrise Clinic. The memory column
					shows what Smaran stored and recalled for these exact sentences.
				</p>
				<div className="pg-msgs" aria-live="polite" ref={box}>
					{shown.map((r, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed script
						<div key={i} className="pg-turn">
							{r.call && <p className="pg-callsep">{r.call}</p>}
							{r.user && <p className="pg-you">{r.user}</p>}
							<div className="pg-replies">
								<p className="pg-agent">
									<span className="who">Asha, with Smaran</span>
									{r.memory}
								</p>
								<p className="pg-agent plain">
									<span className="who">Same agent, no memory</span>
									{r.plain}
								</p>
							</div>
						</div>
					))}
				</div>
				<div className="pg-actions">
					<button
						type="button"
						className="btn btn-ink btn-sm"
						onClick={() => setStep((s) => Math.min(RECORDED.length - 1, s + 1))}
						disabled={step >= RECORDED.length - 1}
					>
						Next turn
					</button>
					<button type="button" className="pg-link" onClick={() => setStep(0)}>
						Start over
					</button>
				</div>
			</section>
			<section className="pg-col pg-mem" aria-labelledby="pg-rec-m">
				<div className="pg-col-h">
					<h2 id="pg-rec-m">Memory</h2>
				</div>
				<ol className="pg-events">
					{[...shown].reverse().map((r, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed script
						<li key={i} className="pg-ev">
							<p className="pg-ev-h">
								{r.user ? `You: “${r.user}”` : "Call started"}
							</p>
							<div className="pg-ev-b">
								<p className="k">{r.note}</p>
							</div>
						</li>
					))}
				</ol>
			</section>
			<CodePanel phase="idle" badges={{}} />
		</div>
	)
}
