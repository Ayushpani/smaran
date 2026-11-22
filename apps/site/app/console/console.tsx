"use client"

import Link from "next/link"
import { type FormEvent, useCallback, useEffect, useState } from "react"
import {
	api,
	clearSession,
	DEFAULT_API,
	type Hit,
	type KeyRow,
	loadSession,
	type Memory,
	type RecallResult,
	type Session,
	saveSession,
	type Usage,
} from "@/lib/api"

const fmtDate = (iso: string) =>
	new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	})

export function Console() {
	const [session, setSession] = useState<Session | null>(null)
	const [ready, setReady] = useState(false)
	useEffect(() => {
		setSession(loadSession())
		setReady(true)
	}, [])
	if (!ready) return <div className="wrap acct-hero" />
	if (!session)
		return (
			<Login
				onIn={(s) => {
					saveSession(s)
					setSession(s)
				}}
			/>
		)
	return (
		<Dashboard
			session={session}
			onOut={() => {
				clearSession()
				setSession(null)
			}}
		/>
	)
}

/* ── Log in ─────────────────────────────────────────────────────────── */

function Login({ onIn }: { onIn: (s: Session) => void }) {
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [show, setShow] = useState(false)

	async function submit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault()
		const f = new FormData(e.currentTarget)
		const url = String(f.get("url") ?? "")
			.trim()
			.replace(/\/$/, "")
		const key = String(f.get("key") ?? "").trim()
		if (!url || !key) return
		setBusy(true)
		setError(null)
		const usage = await api<Usage>(url, key, "GET", "/v1/usage")
		if (usage.ok) {
			onIn({ url, key, mode: "account" })
			return
		}
		if (usage.status === 404) {
			// A sandbox server has no accounts. Check the key against recall instead.
			const probe = await api(url, key, "POST", "/v1/recall", {
				userId: "console-check",
				query: "hello",
			})
			if (probe.ok) {
				onIn({ url, key, mode: "sandbox" })
				return
			}
			setError(probe.message)
		} else if (usage.status === 401) {
			setError("That key isn’t valid on this server, or it was revoked.")
		} else setError(usage.message)
		setBusy(false)
	}

	return (
		<div className="wrap">
			<div className="acct-hero">
				<h1>Log in to the console.</h1>
				<p>
					Smaran accounts use API keys, not passwords. Paste a key to see usage,
					manage keys and try save and recall on your own data.
				</p>
			</div>
			<div className="acct-grid">
				<form className="panel" onSubmit={submit}>
					<h2>Your key</h2>
					<p className="sub">
						Kept in this browser tab only, and cleared when you close it.
					</p>
					<div className="form">
						<label>
							Server
							<input
								name="url"
								className="mono"
								required
								defaultValue={DEFAULT_API || "http://localhost:8787"}
								autoComplete="url"
								inputMode="url"
							/>
						</label>
						<label>
							API key
							<input
								name="key"
								type={show ? "text" : "password"}
								className="mono"
								required
								placeholder="sk_…"
								autoComplete="off"
								spellCheck={false}
							/>
						</label>
						<label
							style={{
								display: "flex",
								gap: "0.5rem",
								alignItems: "center",
								fontWeight: 400,
							}}
						>
							<input
								type="checkbox"
								checked={show}
								onChange={(e) => setShow(e.target.checked)}
								style={{ width: "auto", minHeight: 0 }}
							/>
							Show the key
						</label>
						{error && (
							<p className="err" role="alert">
								{error}
							</p>
						)}
						<button className="btn btn-ink" type="submit" disabled={busy}>
							{busy ? "Checking the key" : "Log in"}
						</button>
					</div>
				</form>
				<div className="side-list">
					<div>
						<b>No key yet?</b>
						<span>
							<Link href="/signup">Create an account</Link> on a hosted server
							and you’ll get one straight away.
						</span>
					</div>
					<div>
						<b>Running the sandbox?</b>
						<span>
							Use <code>http://localhost:8787</code> and the key{" "}
							<code>sk_local_dev</code>. Accounts and keys need a Postgres
							server, but the playground works.
						</span>
					</div>
					<div>
						<b>Self-hosting?</b>
						<span>
							Make keys with <code>bun run keys key:create</code> and allow this
							site in <code>CORS_ORIGIN</code>. See{" "}
							<Link href="/docs/self-host">Self-host</Link>.
						</span>
					</div>
				</div>
			</div>
		</div>
	)
}

/* ── Dashboard ──────────────────────────────────────────────────────── */

function Dashboard({
	session,
	onOut,
}: {
	session: Session
	onOut: () => void
}) {
	const [usage, setUsage] = useState<Usage | null>(null)
	const [tab, setTab] = useState<"play" | "keys" | "start">("play")
	const accounts = session.mode === "account"

	const refresh = useCallback(async () => {
		if (!accounts) return
		const u = await api<Usage>(session.url, session.key, "GET", "/v1/usage")
		if (u.ok) setUsage(u.data)
		else if (u.status === 401) onOut()
	}, [accounts, session, onOut])
	useEffect(() => {
		void refresh()
	}, [refresh])

	const quota = usage?.limits.memories ?? null
	const used = usage?.memories ?? 0
	type Tab = "play" | "keys" | "start"
	const tabs: { id: Tab; label: string }[] = [
		{ id: "play", label: "Playground" },
		...(accounts ? [{ id: "keys" as const, label: "API keys" }] : []),
		{ id: "start", label: "Use it in code" },
	]

	return (
		<div className="wrap">
			<div className="acct-hero console-top">
				<div>
					<h1>Console</h1>
					<p className="who">
						{accounts && usage ? (
							<>
								Account <code>{usage.tenantId.slice(0, 8)}</code> on{" "}
								<code>{session.url}</code>
							</>
						) : (
							<>
								Sandbox server <code>{session.url}</code>. Accounts and keys
								need Postgres mode.
							</>
						)}
					</p>
				</div>
				<button className="btn btn-line btn-sm" type="button" onClick={onOut}>
					Log out
				</button>
			</div>

			{accounts && (
				<div className="stats">
					<div className="stat">
						<span className="k">Memories stored</span>
						<span className="v">
							{used.toLocaleString()}
							{quota != null && <small> of {quota.toLocaleString()}</small>}
						</span>
						{quota != null && (
							<div
								className="meter"
								role="img"
								aria-label={`${Math.round((used / quota) * 100)}% of the plan`}
							>
								<i
									style={{
										transform: `scaleX(${Math.min(1, used / Math.max(1, quota))})`,
									}}
								/>
							</div>
						)}
					</div>
					<div className="stat">
						<span className="k">Requests per minute</span>
						<span className="v">
							{usage?.limits.requestsPerMinute ?? "Server default"}
						</span>
					</div>
					<div className="stat">
						<span className="k">Plan</span>
						<span className="v" style={{ textTransform: "capitalize" }}>
							{usage?.plan ?? ""}
						</span>
					</div>
				</div>
			)}

			<div className="console-tabs" role="tablist" aria-label="Console">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						aria-selected={tab === t.id}
						onClick={() => setTab(t.id)}
					>
						{t.label}
					</button>
				))}
			</div>
			<div role="tabpanel">
				{tab === "play" && <Playground session={session} onSaved={refresh} />}
				{tab === "keys" && accounts && <Keys session={session} />}
				{tab === "start" && <StartCode session={session} />}
			</div>
		</div>
	)
}

/* ── Playground ─────────────────────────────────────────────────────── */

const SAVE_EXAMPLES = [
	"My room number is 13, sorry, 913.",
	"mera pin hai ek do teen, nahi, teen do ek",
	"I'm allergic to peanuts.",
	"I live in Andheri West, near Lokhandwala.",
]
const ASK_EXAMPLES = [
	"what is my room number?",
	"what am I allergic to?",
	"where do I live?",
	"mera pin kya hai?",
]

function Playground({
	session,
	onSaved,
}: {
	session: Session
	onSaved: () => void
}) {
	const [userId, setUserId] = useState("console-demo")
	const [text, setText] = useState(SAVE_EXAMPLES[0]!)
	const [query, setQuery] = useState(ASK_EXAMPLES[0]!)
	const [rerank, setRerank] = useState(true)
	const [saving, setSaving] = useState(false)
	const [asking, setAsking] = useState(false)
	const [saved, setSaved] = useState<{
		memories: Memory[]
		skipped?: string
	} | null>(null)
	const [recall, setRecall] = useState<RecallResult | null>(null)
	const [err, setErr] = useState<string | null>(null)

	async function save(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		setErr(null)
		const r = await api<{ memories: Memory[]; skipped?: string }>(
			session.url,
			session.key,
			"POST",
			"/v1/memories",
			{ userId, text, source: "voice" },
		)
		setSaving(false)
		if (!r.ok) return setErr(r.message)
		setSaved(r.data)
		onSaved()
	}
	async function ask(e: FormEvent) {
		e.preventDefault()
		setAsking(true)
		setErr(null)
		const r = await api<RecallResult>(
			session.url,
			session.key,
			"POST",
			"/v1/recall",
			{
				userId,
				query,
				topK: 5,
				rerank,
			},
		)
		setAsking(false)
		if (!r.ok) return setErr(r.message)
		setRecall(r.data)
	}

	const maxCh: Record<string, number> = {}
	for (const h of recall?.hits ?? [])
		for (const [k, v] of Object.entries(h.channels ?? {}))
			maxCh[k] = Math.max(maxCh[k] ?? 0, v ?? 0)

	return (
		<div>
			<div className="inline-form" style={{ alignItems: "center" }}>
				<label htmlFor="pg-user" style={{ color: "var(--muted)" }}>
					Caller ID
				</label>
				<input
					id="pg-user"
					className="input mono"
					value={userId}
					onChange={(e) => setUserId(e.target.value)}
					style={{ maxWidth: "18rem" }}
				/>
				<span className="src">
					Memories are kept per caller. Use a test ID here.
				</span>
			</div>
			{err && (
				<p className="err" role="alert" style={{ marginTop: "1rem" }}>
					{err}
				</p>
			)}
			<div className="pg-grid">
				<form className="panel" onSubmit={save}>
					<h2>Save what the caller said</h2>
					<p className="sub">
						Runs the real cleaning and self-correction on the server.
					</p>
					<div className="form">
						<textarea
							value={text}
							onChange={(e) => setText(e.target.value)}
							aria-label="What the caller said"
							maxLength={2000}
						/>
						<div className="examples">
							{SAVE_EXAMPLES.map((x) => (
								<button key={x} type="button" onClick={() => setText(x)}>
									{x}
								</button>
							))}
						</div>
						<button
							className="btn btn-ink"
							type="submit"
							disabled={saving || !text.trim()}
						>
							{saving ? "Saving" : "Save"}
						</button>
					</div>
					{saved && (
						<div className="result" aria-live="polite">
							{saved.skipped ? (
								<p className="orig">
									Not stored: it reads as a question or is too short.
								</p>
							) : (
								saved.memories.map((m) => (
									<div key={m.id}>
										<p className="stored">{m.text}</p>
										{m.metadata.corrections?.map((c) => (
											<p className="orig" key={c.retracted}>
												Dropped <s>{c.retracted}</s>, kept “{c.kept}”
											</p>
										))}
										{m.supersedesId && (
											<p className="orig">
												This replaced an earlier memory, which is now closed.
											</p>
										)}
										<p className="orig">
											{m.kind}
											{m.metadata.language
												? `, ${String(m.metadata.language)}`
												: ""}
										</p>
									</div>
								))
							)}
						</div>
					)}
				</form>

				<form className="panel" onSubmit={ask}>
					<h2>Recall before the reply</h2>
					<p className="sub">
						Search by meaning, words and graph, then rerank.
					</p>
					<div className="form">
						<input
							className="input"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							aria-label="Question"
							maxLength={500}
						/>
						<div className="examples">
							{ASK_EXAMPLES.map((x) => (
								<button key={x} type="button" onClick={() => setQuery(x)}>
									{x}
								</button>
							))}
						</div>
						<label
							style={{
								display: "flex",
								gap: "0.5rem",
								alignItems: "center",
								fontWeight: 400,
							}}
						>
							<input
								type="checkbox"
								checked={rerank}
								onChange={(e) => setRerank(e.target.checked)}
								style={{ width: "auto", minHeight: 0 }}
							/>
							Rerank (slower, more accurate)
						</label>
						<button
							className="btn btn-keep"
							type="submit"
							disabled={asking || !query.trim()}
						>
							{asking ? "Recalling" : "Recall"}
						</button>
					</div>
					{recall && (
						<div className="result" aria-live="polite">
							<Latency r={recall} />
							{recall.hits.length === 0 && (
								<p className="empty">
									Nothing stored for this caller matches yet.
								</p>
							)}
							{recall.hits.map((h: Hit, i) => (
								<div className="hit" key={h.memory.id}>
									<p className="t">
										{i + 1}. {h.memory.text}
									</p>
									<div className="meta">
										<span>score {h.score.toFixed(3)}</span>
										<span>{h.tier}</span>
										<span>{fmtDate(h.memory.createdAt)}</span>
									</div>
									{h.channels && (
										<div className="chbars">
											{(["dense", "keyword", "graph", "temporal"] as const).map(
												(k) => (
													<div className="chbar" key={k}>
														<span>
															{
																{
																	dense: "meaning",
																	keyword: "words",
																	graph: "graph",
																	temporal: "recency",
																}[k]
															}
														</span>
														<i
															style={{
																["--v" as string]: maxCh[k]
																	? (h.channels?.[k] ?? 0) / maxCh[k]!
																	: 0,
															}}
														/>
													</div>
												),
											)}
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</form>
			</div>
		</div>
	)
}

function Latency({ r }: { r: RecallResult }) {
	const l = r.latencyMs
	const total = Math.max(1, l.total)
	const parts = [
		{ k: "Embed", v: l.embed, c: "var(--keep)" },
		{ k: "Search", v: l.search, c: "var(--ink)" },
		{ k: "Rerank", v: l.rerank, c: "var(--fix)" },
	]
	return (
		<div>
			<p className="orig">
				{Math.round(l.total)} ms on the server
				{r.reranker ? `, reranked by ${r.reranker}` : ", not reranked"}
			</p>
			<div
				className="lat"
				role="img"
				aria-label={parts.map((p) => `${p.k} ${Math.round(p.v)} ms`).join(", ")}
			>
				{parts.map((p) => (
					<i
						key={p.k}
						style={{ width: `${(p.v / total) * 100}%`, background: p.c }}
					/>
				))}
			</div>
			<div className="lat-legend">
				{parts.map((p) => (
					<span key={p.k}>
						<b style={{ background: p.c }} />
						{p.k} {Math.round(p.v)} ms
					</span>
				))}
			</div>
		</div>
	)
}

/* ── Keys ───────────────────────────────────────────────────────────── */

function Keys({ session }: { session: Session }) {
	const [keys, setKeys] = useState<KeyRow[] | null>(null)
	const [err, setErr] = useState<string | null>(null)
	const [fresh, setFresh] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)
	const [confirm, setConfirm] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const load = useCallback(async () => {
		const r = await api<{ keys: KeyRow[] }>(
			session.url,
			session.key,
			"GET",
			"/v1/keys",
		)
		if (r.ok) setKeys(r.data.keys)
		else setErr(r.message)
	}, [session])
	useEffect(() => {
		void load()
	}, [load])

	async function create(e: FormEvent<HTMLFormElement>) {
		e.preventDefault()
		const form = e.currentTarget
		const label = String(new FormData(form).get("label") ?? "").trim()
		setBusy(true)
		setErr(null)
		const r = await api<{ apiKey: string }>(
			session.url,
			session.key,
			"POST",
			"/v1/keys",
			label ? { label } : {},
		)
		setBusy(false)
		if (!r.ok) return setErr(r.message)
		setFresh(r.data.apiKey)
		setCopied(false)
		form.reset()
		void load()
	}
	async function revoke(id: string) {
		setBusy(true)
		setErr(null)
		const r = await api(session.url, session.key, "DELETE", `/v1/keys/${id}`)
		setBusy(false)
		setConfirm(null)
		if (!r.ok) return setErr(r.message)
		void load()
	}

	return (
		<div className="panel" style={{ marginTop: "1.5rem" }}>
			<h2>API keys</h2>
			<p className="sub">
				Each key works for this whole account. Revoking one takes effect within
				seconds. Keys are only ever shown once.
			</p>
			<form className="inline-form" onSubmit={create}>
				<input
					name="label"
					className="input"
					placeholder="Label, for example production"
					maxLength={80}
					aria-label="Label for the new key"
				/>
				<button className="btn btn-ink" type="submit" disabled={busy}>
					Create a key
				</button>
			</form>
			{fresh && (
				<div aria-live="polite">
					<div className="secret">
						<code>{fresh}</code>
						<button
							className="btn btn-line"
							type="button"
							onClick={() => {
								void navigator.clipboard
									?.writeText(fresh)
									.then(() => setCopied(true))
							}}
						>
							{copied ? "Copied" : "Copy"}
						</button>
					</div>
					<p className="warnline">Copy it now. It won’t be shown again.</p>
				</div>
			)}
			{err && (
				<p className="err" role="alert" style={{ marginTop: "1rem" }}>
					{err}
				</p>
			)}
			<div className="table-wrap">
				<table className="ktable">
					<thead>
						<tr>
							<th scope="col">Label</th>
							<th scope="col">Key ID</th>
							<th scope="col">Created</th>
							<th scope="col">Status</th>
							<th scope="col">
								<span className="vh">Actions</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{keys === null && (
							<tr>
								<td colSpan={5} className="empty">
									Loading keys
								</td>
							</tr>
						)}
						{keys?.map((k) => (
							<tr key={k.id} className={k.revokedAt ? "revoked" : ""}>
								<td>{k.label || "Untitled"}</td>
								<td>
									<code>{k.id.slice(0, 8)}</code>
								</td>
								<td>{fmtDate(k.createdAt)}</td>
								<td>
									{k.revokedAt ? (
										<span className="pill">Revoked {fmtDate(k.revokedAt)}</span>
									) : k.current ? (
										<span className="pill cur">This session</span>
									) : (
										<span className="pill">Active</span>
									)}
								</td>
								<td style={{ textAlign: "right" }}>
									{!k.revokedAt &&
										(confirm === k.id ? (
											<span style={{ display: "inline-flex", gap: "0.4rem" }}>
												<button
													className="btn btn-danger btn-sm"
													type="button"
													disabled={busy}
													onClick={() => void revoke(k.id)}
												>
													Revoke it
												</button>
												<button
													className="btn btn-line btn-sm"
													type="button"
													onClick={() => setConfirm(null)}
												>
													Keep
												</button>
											</span>
										) : (
											<button
												className="btn btn-line btn-sm"
												type="button"
												onClick={() => setConfirm(k.id)}
											>
												Revoke
											</button>
										))}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

/* ── Code with this account's server ────────────────────────────────── */

function StartCode({ session }: { session: Session }) {
	const masked = `${session.key.slice(0, 7)}…`
	return (
		<div className="panel" style={{ marginTop: "1.5rem" }}>
			<h2>Use it in code</h2>
			<p className="sub">
				Your server is <code>{session.url}</code>. Keep the key in an
				environment variable, shown here as {masked}.
			</p>
			<div className="editor" style={{ marginTop: "1.2rem" }}>
				<pre>
					<code>{`npm install @smaranai/sdk-ts

import { Smaran } from "@smaranai/sdk-ts"

const smaran = new Smaran({
  apiKey: process.env.SMARAN_API_KEY,   // ${masked}
  baseUrl: "${session.url}",
})

await smaran.save({ userId: "caller-1", text: transcript })
const { hits } = await smaran.recall({ userId: "caller-1", query })`}</code>
				</pre>
			</div>
			<p className="src" style={{ marginTop: "1rem" }}>
				More in the <Link href="/docs/sdk">TypeScript SDK</Link>,{" "}
				<Link href="/docs/api">REST API</Link> and{" "}
				<Link href="/docs/voice">voice concepts</Link> docs.
			</p>
		</div>
	)
}
