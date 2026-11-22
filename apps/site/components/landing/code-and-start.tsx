"use client"

import Link from "next/link"
import {
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react"
import { gsap, motionOn, ScrollTrigger } from "@/lib/gsap"
import { Reveal } from "./reveal"

const K = ({ children }: { children: ReactNode }) => (
	<span className="tk-k">{children}</span>
)
const S = ({ children }: { children: ReactNode }) => (
	<span className="tk-s">{children}</span>
)
const C = ({ children }: { children: ReactNode }) => (
	<span className="tk-c">{children}</span>
)

const SNIPPETS: { id: string; tab: string; raw: string; code: ReactNode }[] = [
	{
		id: "ts",
		tab: "TypeScript",
		raw: `import { Smaran } from "@smaranai/sdk-ts"

const smaran = new Smaran({ apiKey, baseUrl })

// after the caller's turn
await smaran.save({ userId: "98201", text: transcript })

// before your agent replies
const { hits } = await smaran.recall({
  userId: "98201",
  query: "what was her room number?",
})`,
		code: (
			<>
				<K>import</K> {"{ Smaran }"} <K>from</K> <S>"@smaranai/sdk-ts"</S>
				{"\n\n"}
				<K>const</K> smaran = <K>new</K> Smaran({"{ apiKey, baseUrl }"}){"\n\n"}
				<C>{"// after the caller's turn"}</C>
				{"\n"}
				<K>await</K> smaran.save({"{ userId: "}
				<S>"98201"</S>
				{", text: transcript })"}
				{"\n\n"}
				<C>{"// before your agent replies"}</C>
				{"\n"}
				<K>const</K> {"{ hits }"} = <K>await</K> smaran.recall({"{"}
				{"\n  userId: "}
				<S>"98201"</S>,{"\n  query: "}
				<S>"what was her room number?"</S>,{"\n})"}
			</>
		),
	},
	{
		id: "py",
		tab: "Python",
		raw: `from smaran import Smaran

memory = Smaran(api_key=api_key, base_url=base_url)

# after the caller's turn
await memory.save(text=transcript, user_id="98201")

# before your agent replies
hits = await memory.recall(
    query="what was her room number?",
    user_id="98201",
)`,
		code: (
			<>
				<K>from</K> smaran <K>import</K> Smaran{"\n\n"}memory =
				Smaran(api_key=api_key, base_url=base_url){"\n\n"}
				<C>{"# after the caller's turn"}</C>
				{"\n"}
				<K>await</K> memory.save(text=transcript, user_id=<S>"98201"</S>)
				{"\n\n"}
				<C>{"# before your agent replies"}</C>
				{"\n"}hits = <K>await</K> memory.recall({"\n    query="}
				<S>"what was her room number?"</S>,{"\n    user_id="}
				<S>"98201"</S>,{"\n)"}
			</>
		),
	},
	{
		id: "http",
		tab: "HTTP",
		raw: `curl $SMARAN/v1/memories \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"userId":"98201","text":"I am in room 930 sorry 913"}'

curl $SMARAN/v1/recall \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"userId":"98201","query":"room number?"}'`,
		code: (
			<>
				curl $SMARAN/v1/memories \{"\n  "}-H <S>"Authorization: Bearer $KEY"</S>{" "}
				\{"\n  "}-H <S>"Content-Type: application/json"</S> \{"\n  "}-d{" "}
				<S>'{'{"userId":"98201","text":"I am in room 930 sorry 913"}'}'</S>
				{"\n\n"}curl $SMARAN/v1/recall \{"\n  "}-H{" "}
				<S>"Authorization: Bearer $KEY"</S> \{"\n  "}-H{" "}
				<S>"Content-Type: application/json"</S> \{"\n  "}-d{" "}
				<S>'{'{"userId":"98201","query":"room number?"}'}'</S>
			</>
		),
	},
	{
		id: "mcp",
		tab: "MCP",
		raw: `{
  "mcpServers": {
    "smaran": {
      "command": "bun",
      "args": ["run", "/path/to/smaran/apps/mcp/local-stdio.ts"],
      "env": {
        "SMARAN_URL": "http://localhost:8787",
        "SMARAN_API_KEY": "sk_local_dev"
      }
    }
  }
}`,
		code: (
			<>
				{"{\n  "}
				<S>"mcpServers"</S>
				{": {\n    "}
				<S>"smaran"</S>
				{": {\n      "}
				<S>"command"</S>: <S>"bun"</S>,{"\n      "}
				<S>"args"</S>: [<S>"run"</S>,{" "}
				<S>"/path/to/smaran/apps/mcp/local-stdio.ts"</S>],
				{"\n      "}
				<S>"env"</S>
				{": {\n        "}
				<S>"SMARAN_URL"</S>: <S>"http://localhost:8787"</S>,{"\n        "}
				<S>"SMARAN_API_KEY"</S>: <S>"sk_local_dev"</S>
				{"\n      }\n    }\n  }\n}"}
			</>
		),
	},
]

export function CodeSection() {
	const [tab, setTab] = useState(0)
	const [copied, setCopied] = useState(false)
	const tabsRef = useRef<HTMLDivElement>(null)
	const preRef = useRef<HTMLPreElement>(null)
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
		const n =
			(tab + (e.key === "ArrowRight" ? 1 : SNIPPETS.length - 1)) %
			SNIPPETS.length
		setTab(n)
		tabsRef.current
			?.querySelectorAll<HTMLButtonElement>("[role=tab]")
			[n]?.focus()
	}
	useEffect(() => {
		if (!motionOn() || !preRef.current) return
		gsap.fromTo(
			preRef.current,
			{ opacity: 0, y: 8 },
			{ opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
		)
	}, [tab])
	const s = SNIPPETS[tab]!
	return (
		<section
			className="section tone-paper"
			data-tone="paper"
			id="code"
			aria-labelledby="code-title"
			style={{ paddingTop: 0 }}
		>
			<div className="wrap code-grid">
				<div>
					<Reveal id="code-title">Two calls in your agent.</Reveal>
					<p className="intro">
						Save after the caller speaks. Recall before your agent replies.
					</p>
					<p className="intro">
						Every integration above wraps these same two calls. Use them
						directly when nothing fits.
					</p>
				</div>
				<div className="editor">
					<div
						className="tabs"
						role="tablist"
						aria-label="Language"
						ref={tabsRef}
						onKeyDown={onKey}
					>
						{SNIPPETS.map((x, k) => (
							<button
								key={x.id}
								role="tab"
								type="button"
								id={`tab-${x.id}`}
								aria-selected={k === tab}
								aria-controls="code-panel"
								tabIndex={k === tab ? 0 : -1}
								onClick={() => {
									setTab(k)
									setCopied(false)
								}}
							>
								{x.tab}
							</button>
						))}
						<button
							type="button"
							className="copy"
							onClick={() => {
								void navigator.clipboard
									?.writeText(s.raw)
									.then(() => setCopied(true))
							}}
						>
							{copied ? "Copied" : "Copy"}
						</button>
					</div>
					<pre
						id="code-panel"
						role="tabpanel"
						aria-labelledby={`tab-${s.id}`}
						ref={preRef}
					>
						<code>{s.code}</code>
					</pre>
				</div>
			</div>
		</section>
	)
}

const CMD = "bun run try"

export function Start() {
	const cmdRef = useRef<HTMLElement>(null)
	const [copied, setCopied] = useState(false)
	useEffect(() => {
		const c = cmdRef.current
		if (!c || !motionOn()) return
		c.textContent = ""
		c.classList.add("typed")
		const st = ScrollTrigger.create({
			trigger: c,
			start: "top 85%",
			once: true,
			onEnter: () => {
				const o = { n: 0 }
				gsap.to(o, {
					n: CMD.length,
					duration: CMD.length * 0.09,
					ease: "none",
					onUpdate: () => {
						c.textContent = CMD.slice(0, Math.round(o.n))
					},
				})
			},
		})
		return () => st.kill()
	}, [])
	return (
		<section
			className="section start tone-hero"
			data-tone="hero"
			aria-labelledby="start-title"
		>
			<div className="wrap">
				<Reveal id="start-title">
					Try it before you sign up for anything.
				</Reveal>
				<div className="cmd">
					<code ref={cmdRef}>{CMD}</code>
					<button
						className="btn btn-ghost"
						type="button"
						onClick={() => {
							void navigator.clipboard
								?.writeText(
									"git clone https://github.com/Ayushpani/smaran && cd smaran && bun install && bun run try",
								)
								.then(() => setCopied(true))
						}}
					>
						{copied ? "Copied the full setup" : "Copy the full setup"}
					</button>
				</div>
				<p className="fine">
					Clone the repository and run that. A sandbox API starts on your laptop
					with a test key, no database and no account. Move to your own Postgres
					when you’re ready. Each caller’s data can be exported or erased with
					one request, for DPDP and GDPR.
				</p>
				<div className="start-grid">
					<Link className="path" href="/docs/quickstart">
						<b>Run the sandbox</b>
						<span>Five minutes from clone to the first recalled memory.</span>
					</Link>
					<Link className="path" href="/signup">
						<b>Get an API key</b>
						<span>An account on a hosted Smaran server, then the console.</span>
					</Link>
					<Link className="path" href="/docs/self-host">
						<b>Self-host on Postgres</b>
						<span>Docker Compose, pgvector, and your own keys and limits.</span>
					</Link>
				</div>
			</div>
		</section>
	)
}
