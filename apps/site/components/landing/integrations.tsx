"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { gsap, motionOn } from "@/lib/gsap"
import { Reveal } from "./reveal"

const GH = "https://github.com/Ayushpani/smaran/tree/main/packages"

interface Item {
	name: string
	what: string
	install: string
	lang: "TypeScript" | "Python" | "Any language"
	href: string
}
interface Group {
	group: string
	items: Item[]
}

// Descriptions follow each package's own description.
const GROUPS: Group[] = [
	{
		group: "Voice platforms",
		items: [
			{
				name: "Vapi",
				what: "Memory function calls and streaming transcripts for Vapi server-URL webhooks.",
				install: "npm install @smaranai/adapter-vapi",
				lang: "TypeScript",
				href: "/docs/adapters/vapi",
			},
			{
				name: "LiveKit Agents",
				what: "Streaming transcripts, recalled context and function calls for LiveKit Agents in Node.",
				install: "npm install @smaranai/adapter-livekit",
				lang: "TypeScript",
				href: "/docs/adapters/livekit",
			},
			{
				name: "Pipecat",
				what: "Memory for Pipecat conversational pipelines.",
				install: "pip install smaran-pipecat",
				lang: "Python",
				href: "/docs/adapters/pipecat",
			},
			{
				name: "Cartesia Line",
				what: "Memory for voice agents built on Cartesia Line.",
				install: "pip install smaran-cartesia",
				lang: "Python",
				href: `${GH}/cartesia-sdk-python`,
			},
			{
				name: "Retell",
				what: "No adapter needed: call the REST API from a Retell custom function or custom LLM.",
				install: "POST /v1/recall from your webhook",
				lang: "Any language",
				href: "/docs/adapters/retell",
			},
		],
	},
	{
		group: "Model APIs",
		items: [
			{
				name: "OpenAI",
				what: "Tools, tool-call handling and recalled context for Chat Completions and compatible APIs. A Python package covers function calling too.",
				install: "npm install @smaranai/adapter-openai",
				lang: "TypeScript",
				href: "/docs/adapters/openai",
			},
			{
				name: "Anthropic",
				what: "Tools, tool_use handling and recalled-memory system prompts for the Messages API.",
				install: "npm install @smaranai/adapter-anthropic",
				lang: "TypeScript",
				href: "/docs/adapters/anthropic",
			},
			{
				name: "Gemini",
				what: "Function declarations and a recalled systemInstruction for @google/genai.",
				install: "npm install @smaranai/adapter-google",
				lang: "TypeScript",
				href: "/docs/adapters/gemini",
			},
		],
	},
	{
		group: "Agent frameworks",
		items: [
			{
				name: "Vercel AI SDK",
				what: "A tool() set for generateText and streamText, plus context injection.",
				install: "npm install @smaranai/adapter-vercel-ai",
				lang: "TypeScript",
				href: `${GH}/adapter-vercel-ai`,
			},
			{
				name: "LangGraph",
				what: "Tools for ToolNode and createReactAgent in LangGraph.js and LangChain.js, plus SystemMessage injection.",
				install: "npm install @smaranai/adapter-langgraph",
				lang: "TypeScript",
				href: `${GH}/adapter-langgraph`,
			},
			{
				name: "Mastra",
				what: "Memory tools for Mastra agents, built with createTool and Zod.",
				install: "npm install @smaranai/adapter-mastra",
				lang: "TypeScript",
				href: `${GH}/adapter-mastra`,
			},
			{
				name: "Microsoft Agent Framework",
				what: "Memory tools and middleware for Microsoft Agent Framework.",
				install: "pip install smaran-agent-framework",
				lang: "Python",
				href: `${GH}/agent-framework-python`,
			},
		],
	},
	{
		group: "Protocols and SDKs",
		items: [
			{
				name: "MCP server",
				what: "Save and recall as MCP tools for any MCP client, hosted on Cloudflare or run locally over stdio.",
				install: "bun run apps/mcp/local-stdio.ts",
				lang: "Any language",
				href: "/docs/mcp",
			},
			{
				name: "Claude Skill",
				what: "A skill that teaches Claude when to save and when to recall.",
				install: "skills/smaran/SKILL.md",
				lang: "Any language",
				href: "/docs/skill",
			},
			{
				name: "TypeScript SDK",
				what: "A zero-dependency client with retries for Node, Bun, Deno, Workers and browsers.",
				install: "npm install @smaranai/sdk-ts",
				lang: "TypeScript",
				href: "/docs/sdk",
			},
			{
				name: "Python SDK",
				what: "An async client with retries for every endpoint.",
				install: "pip install smaran",
				lang: "Python",
				href: `${GH}/sdk-python`,
			},
			{
				name: "REST and OpenAPI",
				what: "Every endpoint is described in OpenAPI 3.1 at /openapi.json, so you can generate a client in any language.",
				install: "GET /openapi.json",
				lang: "Any language",
				href: "/docs/api",
			},
		],
	},
]

const ALL = GROUPS.flatMap((g, gi) => g.items.map((it) => ({ ...it, gi })))

export function Integrations() {
	const [sel, setSel] = useState(0)
	const [hover, setHover] = useState<number | null>(null)
	const [copied, setCopied] = useState(false)
	const orbit = useRef<SVGGElement>(null)
	const card = useRef<HTMLDivElement>(null)
	const active = hover ?? sel
	const it = ALL[active]!

	// Node positions: one ring per group.
	const nodes = useMemo(() => {
		const radii = [92, 150, 205, 258]
		return ALL.map((x, i) => {
			const inGroup = ALL.filter((y) => y.gi === x.gi)
			const k = inGroup.indexOf(x)
			const a = (k / inGroup.length) * Math.PI * 2 + x.gi * 0.7 + i * 0.05
			const r = radii[x.gi]!
			return { x: Math.cos(a) * r, y: Math.sin(a) * r }
		})
	}, [])

	useEffect(() => {
		const g = orbit.current
		if (!g || !motionOn()) return
		const rings = g.querySelectorAll<SVGGElement>(".ring")
		const tweens = [...rings].map((r, i) =>
			gsap.to(r, {
				rotation: i % 2 ? -360 : 360,
				duration: 90 + i * 30,
				ease: "none",
				repeat: -1,
				svgOrigin: "0 0",
			}),
		)
		// keep labels upright while their ring turns
		const labels = g.querySelectorAll<SVGTextElement>(".n-label")
		const upright = () => {
			for (const l of labels) {
				const ring = l.closest(".ring") as SVGGElement | null
				const rot = ring ? Number(gsap.getProperty(ring, "rotation")) : 0
				const x = Number(l.getAttribute("data-x"))
				const y = Number(l.getAttribute("data-y"))
				l.setAttribute("transform", `rotate(${-rot} ${x} ${y})`)
			}
		}
		gsap.ticker.add(upright)
		return () => {
			for (const t of tweens) t.kill()
			gsap.ticker.remove(upright)
		}
	}, [])

	useEffect(() => {
		if (!card.current || !motionOn()) return
		gsap.fromTo(
			card.current.children,
			{ y: 10, opacity: 0 },
			{ y: 0, opacity: 1, duration: 0.45, stagger: 0.05, ease: "power3.out" },
		)
	}, [active])

	return (
		<section
			className="section integ tone-paper"
			data-tone="paper"
			id="integrations"
			aria-labelledby="integ-title"
		>
			<div className="wrap">
				<p className="kicker">Integrations</p>
				<Reveal id="integ-title">Plugs into the stack you already run.</Reveal>
				<p className="intro">
					Voice platforms, model APIs, agent frameworks and protocols. Each
					piece translates the same two memory tools, save and recall, into that
					framework’s own shape. Pick one.
				</p>
				<div className="integ-grid">
					<div className="integ-list">
						{GROUPS.map((g, gi) => (
							<div key={g.group} className="ig">
								<p className="ig-h">{g.group}</p>
								<div className="ig-items">
									{g.items.map((x) => {
										const i = ALL.findIndex((y) => y.name === x.name)
										return (
											<button
												key={x.name}
												type="button"
												className={`ig-item${i === active ? " on" : ""}`}
												aria-pressed={i === sel}
												onClick={() => {
													setSel(i)
													setCopied(false)
												}}
												onPointerEnter={() => setHover(i)}
												onPointerLeave={() => setHover(null)}
												onFocus={() => setHover(i)}
												onBlur={() => setHover(null)}
												data-g={gi}
											>
												{x.name}
											</button>
										)
									})}
								</div>
							</div>
						))}
					</div>
					<div className="integ-side">
						<svg
							className="orbit"
							viewBox="-340 -320 680 640"
							role="img"
							aria-label={`Smaran at the centre, connected to ${ALL.length} integrations`}
						>
							<g ref={orbit}>
								{[92, 150, 205, 258].map((r) => (
									<circle key={r} r={r} className="o-ring" />
								))}
								{GROUPS.map((g, gi) => (
									<g key={g.group} className="ring">
										{ALL.map((x, i) =>
											x.gi !== gi ? null : (
												<g
													key={x.name}
													className={`node${i === active ? " on" : ""}`}
												>
													<line
														x1={0}
														y1={0}
														x2={nodes[i]!.x}
														y2={nodes[i]!.y}
														className="o-line"
													/>
													<circle
														cx={nodes[i]!.x}
														cy={nodes[i]!.y}
														r={i === active ? 9 : 5.5}
														className="o-dot"
													/>
													<text
														x={nodes[i]!.x}
														y={nodes[i]!.y - 14}
														data-x={nodes[i]!.x}
														data-y={nodes[i]!.y}
														textAnchor="middle"
														className="n-label"
													>
														{x.name}
													</text>
												</g>
											),
										)}
									</g>
								))}
								<circle r={44} className="o-core" />
								<text y={6} textAnchor="middle" className="o-core-t">
									smaran
								</text>
							</g>
						</svg>
						<div className="integ-card" ref={card} aria-live="polite">
							<p className="ic-top">
								<b>{it.name}</b>
								<span>{it.lang}</span>
							</p>
							<p className="ic-what">{it.what}</p>
							<div className="ic-install">
								<code>{it.install}</code>
								<button
									type="button"
									onClick={() => {
										void navigator.clipboard
											?.writeText(it.install)
											.then(() => setCopied(true))
									}}
								>
									{copied ? "Copied" : "Copy"}
								</button>
							</div>
							{it.href.startsWith("/") ? (
								<Link className="ic-link" href={it.href}>
									Read the {it.name} guide
								</Link>
							) : (
								<a className="ic-link" href={it.href}>
									See the {it.name} package
								</a>
							)}
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}
