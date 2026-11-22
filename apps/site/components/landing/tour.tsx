"use client"

import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react"
import { el, gsap, motionOn, ScrollTrigger } from "@/lib/gsap"
import { PALETTE_EVENT, token } from "@/lib/palette"
import { Reveal } from "./reveal"

/** True while the element is on screen (works with the horizontal track's transforms). */
function useOnScreen(ref: RefObject<HTMLElement | null>, threshold = 0.35) {
	const [on, setOn] = useState(false)
	useEffect(() => {
		const n = ref.current
		if (!n) return
		const io = new IntersectionObserver(([e]) => setOn(!!e?.isIntersecting), {
			threshold,
		})
		io.observe(n)
		return () => io.disconnect()
	}, [ref, threshold])
	return on
}

/* ── 1. Streaming ingest ──────────────────────────────────────────── */
const PARTIALS = [
	"my flat",
	"my flat is 21",
	"my flat is 21, no wait",
	"my flat is 21, no wait, 12, B wing",
]
function IngestViz() {
	const box = useRef<HTMLDivElement>(null)
	const on = useOnScreen(box)
	useEffect(() => {
		const b = box.current
		if (!b || !on || !motionOn()) return
		const list = b.querySelector(".iv-list")
		const out = b.querySelector(".iv-out")
		if (!list || !out) return
		const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 })
		tl.call(() => {
			list.replaceChildren()
			out.textContent = ""
			out.classList.remove("on")
		})
		PARTIALS.forEach((p, i) => {
			tl.call(
				() => {
					const row = el("p", "iv-row")
					row.append(el("span", "iv-k", "partial"), el("span", "", p))
					list.append(row)
					gsap.from(row, {
						y: 14,
						opacity: 0,
						duration: 0.4,
						ease: "power3.out",
					})
					for (const prev of list.querySelectorAll(".iv-row:not(:last-child)"))
						prev.classList.add("old")
				},
				undefined,
				0.3 + i * 0.75,
			)
		})
		tl.call(
			() => {
				out.textContent = "my flat is 12, B wing"
				out.classList.add("on")
				gsap.from(out, {
					scale: 0.92,
					opacity: 0,
					duration: 0.6,
					ease: "back.out(2)",
				})
			},
			undefined,
			0.3 + PARTIALS.length * 0.75 + 0.3,
		)
		tl.to({}, { duration: 2 })
		return () => {
			tl.kill()
		}
	}, [on])
	return (
		<div className="viz iv" ref={box}>
			<div className="iv-list">
				{PARTIALS.map((p) => (
					<p className="iv-row old" key={p}>
						<span className="iv-k">partial</span>
						<span>{p}</span>
					</p>
				))}
			</div>
			<p className="iv-commit">
				<span className="iv-k">commit</span>
				<span className="iv-out on">my flat is 12, B wing</span>
			</p>
		</div>
	)
}

/* ── 2. Live events ───────────────────────────────────────────────── */
const EVENTS = [
	["memory.saved", "My room number is 913"],
	["memory.saved", "I’m allergic to penicillin"],
	["memory.saved", "mera ghar Andheri West mein hai"],
	["memory.forgotten", "mem_8f2c"],
	["memory.saved", "We moved flats last month"],
]
function EventsViz() {
	const box = useRef<HTMLDivElement>(null)
	const on = useOnScreen(box)
	useEffect(() => {
		const b = box.current?.querySelector(".ev-log")
		if (!b || !on || !motionOn()) return
		let i = 0
		const add = () => {
			const [type, data] = EVENTS[i % EVENTS.length]!
			i++
			const row = el("p", `ev-row${type === "memory.forgotten" ? " gone" : ""}`)
			row.append(
				el("span", "ev-t", `event: ${type}`),
				el(
					"span",
					"ev-d",
					`data: ${type === "memory.forgotten" ? `{"id":"${data}"}` : `{"text":"${data}"}`}`,
				),
			)
			b.prepend(row)
			gsap.from(row, {
				height: 0,
				opacity: 0,
				duration: 0.5,
				ease: "power3.out",
			})
			while (b.children.length > 5) b.lastElementChild?.remove()
		}
		add()
		const id = window.setInterval(add, 1300)
		return () => clearInterval(id)
	}, [on])
	return (
		<div className="viz ev" ref={box}>
			<p className="ev-head">
				<span className="rec">GET /v1/sessions/call-0417/subscribe</span>
			</p>
			<div className="ev-log">
				{EVENTS.slice(0, 3).map(([t, d]) => (
					<p className="ev-row" key={d}>
						<span className="ev-t">event: {t}</span>
						<span className="ev-d">data: {`{"text":"${d}"}`}</span>
					</p>
				))}
			</div>
		</div>
	)
}

/* ── 3. Knowledge graph ───────────────────────────────────────────── */
const NODES = [
	{ id: "Priya", x: 0.5, y: 0.5, main: true },
	{ id: "Andheri West", x: 0.2, y: 0.25 },
	{ id: "Mother", x: 0.8, y: 0.22 },
	{ id: "Pune", x: 0.88, y: 0.62 },
	{ id: "Room 913", x: 0.22, y: 0.78 },
	{ id: "Peanuts", x: 0.55, y: 0.88 },
	{ id: "Lower Parel", x: 0.12, y: 0.52 },
]
const EDGES: [number, number, string][] = [
	[0, 1, "lives in"],
	[0, 2, "mother"],
	[2, 3, "lives in"],
	[0, 4, "stays in"],
	[0, 5, "allergic to"],
	[0, 6, "works in"],
]
function GraphViz() {
	const box = useRef<HTMLDivElement>(null)
	const cv = useRef<HTMLCanvasElement>(null)
	const on = useOnScreen(box)
	useEffect(() => {
		const c = cv.current
		const ctx = c?.getContext("2d")
		if (!c || !ctx) return
		let fg = token("--deep-fg")
		let keep = token("--keep-deep")
		let dim = token("--deep-dim")
		const onPal = () => {
			fg = token("--deep-fg")
			keep = token("--keep-deep")
			dim = token("--deep-dim")
		}
		window.addEventListener(PALETTE_EVENT, onPal)
		let raf = 0
		const draw = (now: number) => {
			const dpr = Math.min(2, window.devicePixelRatio || 1)
			const W = c.clientWidth
			const H = c.clientHeight
			if (c.width !== W * dpr) {
				c.width = W * dpr
				c.height = H * dpr
			}
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			ctx.clearRect(0, 0, W, H)
			const t = now / 1000
			const pos = NODES.map((n, i) => ({
				x: (n.x + Math.sin(t * 0.6 + i * 1.7) * 0.015) * W,
				y: (n.y + Math.cos(t * 0.5 + i * 2.3) * 0.02) * H,
			}))
			const walk = (t * 0.45) % EDGES.length
			EDGES.forEach(([a, b, label], i) => {
				const p = pos[a]!
				const q = pos[b]!
				const lit = Math.floor(walk) === i
				ctx.strokeStyle = lit ? keep : dim
				ctx.globalAlpha = lit ? 1 : 0.5
				ctx.lineWidth = lit ? 2 : 1
				ctx.beginPath()
				ctx.moveTo(p.x, p.y)
				ctx.lineTo(q.x, q.y)
				ctx.stroke()
				if (lit) {
					const f = walk - i
					ctx.fillStyle = keep
					ctx.beginPath()
					ctx.arc(
						p.x + (q.x - p.x) * f,
						p.y + (q.y - p.y) * f,
						4,
						0,
						Math.PI * 2,
					)
					ctx.fill()
				}
				ctx.globalAlpha = 0.75
				ctx.fillStyle = dim
				ctx.font = "12px 'Anek Latin', system-ui"
				ctx.fillText(label, (p.x + q.x) / 2 + 4, (p.y + q.y) / 2 - 4)
			})
			NODES.forEach((n, i) => {
				const p = pos[i]!
				ctx.globalAlpha = 1
				ctx.fillStyle = n.main ? keep : fg
				ctx.beginPath()
				ctx.arc(p.x, p.y, n.main ? 7 : 4.5, 0, Math.PI * 2)
				ctx.fill()
				ctx.font = `${n.main ? 600 : 500} ${n.main ? 15 : 13}px 'Anek Latin', system-ui`
				ctx.fillStyle = fg
				ctx.fillText(n.id, p.x + 10, p.y + 4)
			})
			if (on && motionOn()) raf = requestAnimationFrame(draw)
		}
		raf = requestAnimationFrame(draw)
		return () => {
			cancelAnimationFrame(raf)
			window.removeEventListener(PALETTE_EVENT, onPal)
		}
	}, [on])
	return (
		<div className="viz gv" ref={box}>
			<canvas
				ref={cv}
				role="img"
				aria-label="A graph linking Priya to Andheri West, her mother in Pune, room 913, a peanut allergy and her office in Lower Parel."
			/>
		</div>
	)
}

/* ── 4. Profile ───────────────────────────────────────────────────── */
const FACTS = [
	["Lives in", "Andheri West"],
	["Room", "913"],
	["Allergies", "Peanuts, penicillin"],
	["Prefers", "Hinglish, evening calls"],
]
function ProfileViz() {
	const box = useRef<HTMLDivElement>(null)
	const on = useOnScreen(box)
	useEffect(() => {
		const b = box.current
		if (!b || !on || !motionOn()) return
		const rows = b.querySelectorAll(".pv-row")
		const chips = b.querySelectorAll(".pv-chip")
		const tl = gsap.timeline({ repeat: -1, repeatDelay: 2.2 })
		tl.set(rows, { opacity: 0, x: 20 })
		tl.set(chips, { opacity: 1, x: 0, y: 0, scale: 1 })
		chips.forEach((chip, i) => {
			const row = rows[i]
			tl.to(
				chip,
				{
					x: 60,
					y: 10,
					scale: 0.6,
					opacity: 0,
					duration: 0.6,
					ease: "power3.in",
				},
				0.4 + i * 0.45,
			)
			if (row)
				tl.to(
					row,
					{ opacity: 1, x: 0, duration: 0.5, ease: "expo.out" },
					0.8 + i * 0.45,
				)
		})
		return () => {
			tl.kill()
		}
	}, [on])
	return (
		<div className="viz pv" ref={box}>
			<div className="pv-chips" aria-hidden="true">
				{[
					"“I live in Andheri West”",
					"“room 913”",
					"“allergic to peanuts”",
					"“call me after 6”",
				].map((c) => (
					<span className="pv-chip" key={c}>
						{c}
					</span>
				))}
			</div>
			<div className="pv-card">
				<p className="pv-h">Profile, caller 98201</p>
				{FACTS.map(([k, v]) => (
					<p className="pv-row" key={k}>
						<span>{k}</span>
						<b>{v}</b>
					</p>
				))}
			</div>
		</div>
	)
}

/* ── 5. Point in time ─────────────────────────────────────────────── */
const DAYS = [
	"1 Oct",
	"3 Oct",
	"10 Oct",
	"19 Oct",
	"26 Oct",
	"2 Nov",
	"9 Nov",
	"14 Nov",
	"22 Nov",
]
function TimeViz() {
	const [d, setD] = useState(2)
	const room = d < 1 ? "nothing yet" : d < 5 ? "13" : "913"
	return (
		<div className="viz tv">
			<p className="tv-q">
				What was her room number on <b>{DAYS[d]}</b>?
			</p>
			<p className={`tv-a${room === "913" ? " now" : ""}`} aria-live="polite">
				{room}
			</p>
			<input
				type="range"
				min={0}
				max={DAYS.length - 1}
				step={1}
				value={d}
				onChange={(e) => setD(Number(e.target.value))}
				aria-label="Date to recall as of"
				aria-valuetext={DAYS[d]}
			/>
			<div className="tv-scale" aria-hidden="true">
				<span>1 Oct</span>
				<span>2 Nov, 913 replaces 13</span>
				<span>today</span>
			</div>
			<p className="tv-note">
				Drag the date. 13 is closed on 2 Nov, never deleted.
			</p>
		</div>
	)
}

/* ── 6. Privacy ───────────────────────────────────────────────────── */
const STORED = [
	"My room number is 913",
	"I’m allergic to peanuts",
	"mera ghar Andheri West mein hai",
	"We moved flats last month",
]
function PrivacyViz() {
	const box = useRef<HTMLDivElement>(null)
	const [gone, setGone] = useState(false)
	const erase = () => {
		const rows = box.current?.querySelectorAll(".prv-row")
		if (!rows) return
		if (!motionOn()) return setGone(true)
		gsap.to(rows, {
			clipPath: "inset(0 0 0 100%)",
			opacity: 0.2,
			duration: 0.5,
			stagger: 0.12,
			ease: "power3.in",
			onComplete: () => setGone(true),
		})
	}
	const restore = () => {
		setGone(false)
		requestAnimationFrame(() => {
			const rows = box.current?.querySelectorAll(".prv-row")
			if (rows && motionOn())
				gsap.fromTo(
					rows,
					{ clipPath: "inset(0 100% 0 0)", opacity: 0.2 },
					{
						clipPath: "inset(0 0% 0 0)",
						opacity: 1,
						duration: 0.5,
						stagger: 0.08,
					},
				)
		})
	}
	return (
		<div className="viz prv" ref={box}>
			<p className="prv-h">Caller 98201, consent to record: granted</p>
			{gone ? (
				<p className="prv-empty" aria-live="polite">
					Erased: memories, sessions and profile. The consent record stays as
					evidence, which DPDP and GDPR allow.
				</p>
			) : (
				STORED.map((s) => (
					<p className="prv-row" key={s}>
						{s}
					</p>
				))
			)}
			<div className="prv-actions">
				{gone ? (
					<button
						type="button"
						className="btn btn-ghost btn-sm"
						onClick={restore}
					>
						Bring the demo back
					</button>
				) : (
					<>
						<button
							type="button"
							className="btn btn-ghost btn-sm"
							onClick={erase}
						>
							Erase this caller
						</button>
						<span className="prv-k">or export everything as JSON</span>
					</>
				)}
			</div>
		</div>
	)
}

/* ── 7. Models ────────────────────────────────────────────────────── */
const EMBEDDERS = [
	"multilingual-e5-small, on your CPU",
	"OpenAI text-embedding-3-small",
]
const RERANKERS = [
	"MiniLM cross-encoder, on your CPU",
	"Your HTTP reranker",
	"Off, fastest",
]
function ModelsViz() {
	const [e, setE] = useState(0)
	const [r, setR] = useState(0)
	return (
		<div className="viz mv">
			<fieldset className="mv-slot">
				<legend>Embedder</legend>
				{EMBEDDERS.map((x, i) => (
					<button
						key={x}
						type="button"
						aria-pressed={i === e}
						onClick={() => setE(i)}
					>
						{x}
					</button>
				))}
			</fieldset>
			<fieldset className="mv-slot">
				<legend>Reranker</legend>
				{RERANKERS.map((x, i) => (
					<button
						key={x}
						type="button"
						aria-pressed={i === r}
						onClick={() => setR(i)}
					>
						{x}
					</button>
				))}
			</fieldset>
			<p className="mv-cost">
				{e === 0 && r !== 1
					? "No paid AI service in the loop."
					: "Calls a model you host or pay for."}
			</p>
		</div>
	)
}

/* ── 8. Scale ─────────────────────────────────────────────────────── */
function ScaleViz() {
	const box = useRef<HTMLDivElement>(null)
	const on = useOnScreen(box)
	useEffect(() => {
		const b = box.current
		if (!b || !on || !motionOn()) return
		const dots = b.querySelectorAll(".sv-dot")
		const tls = [...dots].map((d, i) =>
			gsap.fromTo(
				d,
				{ attr: { cy: 34 }, opacity: 0 },
				{
					attr: { cy: 150 },
					opacity: 1,
					duration: 1.1,
					repeat: -1,
					yoyo: true,
					delay: i * 0.37,
					ease: "power1.inOut",
				},
			),
		)
		return () => {
			for (const t of tls) t.kill()
		}
	}, [on])
	return (
		<div className="viz sv" ref={box}>
			<svg
				viewBox="0 0 320 200"
				role="img"
				aria-label="Three API servers sharing one Postgres database"
			>
				{[50, 160, 270].map((x, i) => (
					<g key={x}>
						<rect
							x={x - 38}
							y={10}
							width={76}
							height={34}
							rx={8}
							className="sv-box"
						/>
						<text x={x} y={32} textAnchor="middle" className="sv-t">
							API {i + 1}
						</text>
						<line x1={x} y1={44} x2={160} y2={150} className="sv-line" />
						<circle cx={x + (160 - x) * 0.5} cy={34} r={4} className="sv-dot" />
					</g>
				))}
				<ellipse cx={160} cy={156} rx={58} ry={12} className="sv-db" />
				<path d="M102 156 v26 a58 12 0 0 0 116 0 v-26" className="sv-db" />
				<text x={160} y={186} textAnchor="middle" className="sv-t">
					Postgres
				</text>
			</svg>
			<p className="sv-note">
				Events, turn buffers and rate limits are shared, so any server can take
				the next request.
			</p>
		</div>
	)
}

/* ── The tour ─────────────────────────────────────────────────────── */
const PANELS: { title: string; body: string; api: string[]; viz: ReactNode }[] =
	[
		{
			title: "Hears the turn as it happens.",
			body: "Partial transcripts stream in while the caller talks and merge into one turn buffer, so overlap never doubles. The turn is cleaned and saved once, on commit.",
			api: ["POST /v1/ingest/partial", "POST /v1/ingest/commit"],
			viz: <IngestViz />,
		},
		{
			title: "Every save, live.",
			body: "Subscribe to a call’s session over Server-Sent Events and get each memory as it is saved or forgotten, from whichever server handled it.",
			api: ["GET /v1/sessions/:id/subscribe"],
			viz: <EventsViz />,
		},
		{
			title: "Knows who and where.",
			body: "People, places and things a caller mentions are linked in a graph per tenant. Recall walks it, and you can traverse it yourself.",
			api: ["POST /v1/graph/entities/extract", "POST /v1/graph/traverse"],
			viz: <GraphViz />,
		},
		{
			title: "A profile ready at hello.",
			body: "A caller’s memories consolidate into one standing profile your agent fetches with a single lookup when the call connects, before anyone speaks.",
			api: ["GET /v1/profile", "POST /v1/profile/consolidate"],
			viz: <ProfileViz />,
		},
		{
			title: "Ask what was true then.",
			body: "Every memory carries the dates it was valid. Pass asOf and recall answers as of that day, with replaced facts still on record.",
			api: ["POST /v1/recall  { asOf }"],
			viz: <TimeViz />,
		},
		{
			title: "Export, erase, consent.",
			body: "One request exports everything stored for a caller and one erases it. Consent goes into an append-only log. Built for India’s DPDP Act and GDPR.",
			api: [
				"GET /v1/dpdp/export",
				"POST /v1/dpdp/right-to-forget",
				"POST /v1/dpdp/consent",
			],
			viz: <PrivacyViz />,
		},
		{
			title: "Your models, per tenant.",
			body: "A free multilingual embedder and a small reranker run on your CPU by default. Register OpenAI or your own HTTP models and switch them per tenant.",
			api: ["POST /v1/models", "POST /v1/models/:id/activate"],
			viz: <ModelsViz />,
		},
		{
			title: "Accounts, keys and many servers.",
			body: "Tenants, API keys, plan quotas and per-tenant rate limits are built in. Run as many API servers as you need behind one Postgres.",
			api: ["POST /v1/signup", "GET /v1/usage", "POST /v1/keys"],
			viz: <ScaleViz />,
		},
	]

export function Tour() {
	const sec = useRef<HTMLElement>(null)
	const track = useRef<HTMLDivElement>(null)
	const bar = useRef<HTMLElement>(null)
	const [cur, setCur] = useState(0)
	useEffect(() => {
		const s = sec.current
		const t = track.current
		if (!s || !t || !motionOn()) return
		const ctx = gsap.context(() => {
			// Hold on the first panel, slide through, hold on the last.
			const tl = gsap.timeline({
				scrollTrigger: {
					trigger: s,
					start: "top top",
					end: "bottom bottom",
					scrub: 0.7,
					invalidateOnRefresh: true,
					onUpdate: (self) => {
						if (bar.current)
							bar.current.style.transform = `scaleX(${self.progress})`
						const p = gsap.utils.clamp(0, 1, (self.progress - 0.06) / 0.88)
						setCur(
							Math.min(PANELS.length - 1, Math.round(p * (PANELS.length - 1))),
						)
					},
				},
			})
			tl.to({}, { duration: 0.06 })
			tl.to(t, {
				x: () => -(t.scrollWidth - window.innerWidth),
				ease: "none",
				duration: 0.88,
			})
			tl.to({}, { duration: 0.06 })
		}, s)
		ScrollTrigger.refresh()
		return () => ctx.revert()
	}, [])
	return (
		<section
			className="tour tone-deep"
			data-tone="deep"
			id="features"
			ref={sec}
			aria-labelledby="tour-title"
		>
			<div className="tour-pin">
				<div className="wrap tour-head">
					<div>
						<p className="kicker">Everything in the box</p>
						<Reveal id="tour-title">More than what was said.</Reveal>
					</div>
					<p className="tour-count" aria-hidden="true">
						<b>{String(cur + 1).padStart(2, "0")}</b> /{" "}
						{String(PANELS.length).padStart(2, "0")}
					</p>
				</div>
				<div className="tour-track" ref={track}>
					{PANELS.map((p, i) => (
						<article className="panel-f" key={p.title} aria-label={p.title}>
							<div className="pf-copy">
								<span className="pf-no">{String(i + 1).padStart(2, "0")}</span>
								<h3>{p.title}</h3>
								<p>{p.body}</p>
								<ul className="pf-api">
									{p.api.map((a) => (
										<li key={a}>
											<code>{a}</code>
										</li>
									))}
								</ul>
							</div>
							{p.viz}
						</article>
					))}
				</div>
				<div className="tour-bar" aria-hidden="true">
					<i ref={bar} />
				</div>
			</div>
		</section>
	)
}
