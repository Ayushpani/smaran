"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { gsap, motionOn, ScrollTrigger } from "@/lib/gsap"

const GH = "https://github.com/Ayushpani/smaran/tree/main/packages"
const ROW_A: [string, string][] = [
	["Vapi", "/docs/adapters/vapi"],
	["LiveKit", "/docs/adapters/livekit"],
	["Pipecat", "/docs/adapters/pipecat"],
	["Cartesia Line", `${GH}/cartesia-sdk-python`],
	["OpenAI", "/docs/adapters/openai"],
	["Anthropic", "/docs/adapters/anthropic"],
	["Gemini", "/docs/adapters/gemini"],
]
const ROW_B: [string, string][] = [
	["Vercel AI SDK", `${GH}/adapter-vercel-ai`],
	["LangGraph", `${GH}/adapter-langgraph`],
	["Mastra", `${GH}/adapter-mastra`],
	["Microsoft Agent Framework", `${GH}/agent-framework-python`],
	["MCP", "/docs/mcp"],
	["Claude Skill", "/docs/skill"],
	["REST and OpenAPI", "/docs/api"],
]

function MqSet({
	items,
	hidden,
}: {
	items: [string, string][]
	hidden?: boolean
}) {
	return (
		<div className="mq-set" aria-hidden={hidden || undefined}>
			{items.map(([name, href]) =>
				href.startsWith("/") ? (
					<Link
						key={name}
						className="mq-item"
						href={href}
						tabIndex={hidden ? -1 : undefined}
					>
						{name}
					</Link>
				) : (
					<a
						key={name}
						className="mq-item"
						href={href}
						tabIndex={hidden ? -1 : undefined}
					>
						{name}
					</a>
				),
			)}
		</div>
	)
}

/** Two rows of integrations drifting in opposite directions; scrolling speeds them up and leans them. */
export function Marquee() {
	const a = useRef<HTMLDivElement>(null)
	const b = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!motionOn() || !a.current || !b.current) return
		const ta = gsap.to(a.current, {
			xPercent: -50,
			duration: 38,
			ease: "none",
			repeat: -1,
		})
		const tb = gsap.fromTo(
			b.current,
			{ xPercent: -50 },
			{ xPercent: 0, duration: 44, ease: "none", repeat: -1 },
		)
		// Start deep into the loop so scrolling up can play it backwards.
		ta.totalTime(38 * 200)
		tb.totalTime(44 * 200)
		const skew = gsap.quickTo([a.current, b.current], "skewX", {
			duration: 0.5,
			ease: "power3",
		})
		let lean = 0
		const st = ScrollTrigger.create({
			onUpdate: (self) => {
				const v = self.getVelocity()
				const dir = self.direction
				const boost = 1 + Math.min(6, Math.abs(v) / 300)
				ta.timeScale(boost * dir)
				tb.timeScale(boost * dir)
				lean = gsap.utils.clamp(-8, 8, -v / 220)
			},
		})
		// Ease the speed back to cruising between scrolls.
		const settle = () => {
			lean *= 0.9
			skew(lean)
			for (const t of [ta, tb]) {
				const ts = t.timeScale()
				t.timeScale(ts + (Math.sign(ts || 1) - ts) * 0.04)
			}
		}
		gsap.ticker.add(settle)
		return () => {
			ta.kill()
			tb.kill()
			st.kill()
			gsap.ticker.remove(settle)
		}
	}, [])
	return (
		<section
			className="marquee tone-hero"
			data-tone="hero"
			aria-label="Works with"
		>
			<p className="wrap cap">Ready-made for the stack you already use</p>
			<div>
				<div className="mq-row" ref={a}>
					<MqSet items={ROW_A} />
					<MqSet items={ROW_A} hidden />
				</div>
				<div className="mq-row dim" ref={b}>
					<MqSet items={ROW_B} />
					<MqSet items={ROW_B} hidden />
				</div>
			</div>
		</section>
	)
}
