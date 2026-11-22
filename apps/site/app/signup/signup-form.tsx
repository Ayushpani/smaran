"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"
import { api, saveSession } from "@/lib/api"

interface SignupResult {
	tenantId: string
	keyId: string
	apiKey: string
	limits: { memories: number; requestsPerMinute: number }
}

export default function SignupForm({ apiUrl }: { apiUrl: string }) {
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [result, setResult] = useState<SignupResult | null>(null)
	const [copied, setCopied] = useState(false)
	const url = apiUrl.replace(/\/$/, "")

	if (!url) {
		return (
			<div className="panel">
				<h2>Sign-up isn’t open on this site yet</h2>
				<p className="sub">
					This site has no Smaran server configured
					(NEXT_PUBLIC_SMARAN_API_URL). You can still run the{" "}
					<Link href="/docs/quickstart">sandbox</Link> or{" "}
					<Link href="/docs/self-host">host your own</Link>.
				</p>
			</div>
		)
	}

	async function submit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault()
		const form = new FormData(e.currentTarget)
		const body: Record<string, string> = {
			name: String(form.get("name") ?? "").trim(),
		}
		for (const k of ["email", "invite"]) {
			const v = String(form.get(k) ?? "").trim()
			if (v) body[k] = v
		}
		setBusy(true)
		setError(null)
		const r = await api<SignupResult>(url, null, "POST", "/v1/signup", body)
		setBusy(false)
		if (!r.ok) {
			setError(
				r.status === 404
					? "This server doesn’t offer sign-up. Ask its operator for an invite or a key."
					: r.message,
			)
			return
		}
		setResult(r.data)
	}

	if (result) {
		return (
			<section className="panel" aria-live="polite">
				<h2>Your API key</h2>
				<div className="secret">
					<code>{result.apiKey}</code>
					<button
						className="btn btn-line"
						type="button"
						onClick={() => {
							void navigator.clipboard
								?.writeText(result.apiKey)
								.then(() => setCopied(true))
						}}
					>
						{copied ? "Copied" : "Copy"}
					</button>
				</div>
				<p className="warnline">Copy it now. It won’t be shown again.</p>
				<p className="sub" style={{ marginTop: "1rem" }}>
					Your plan: {result.limits.memories.toLocaleString()} memories and{" "}
					{result.limits.requestsPerMinute} requests a minute.
				</p>
				<div className="actions" style={{ marginTop: "1.4rem" }}>
					<button
						className="btn btn-ink"
						type="button"
						onClick={() => {
							saveSession({ url, key: result.apiKey, mode: "account" })
							router.push("/console")
						}}
					>
						Open the console
					</button>
					<Link className="btn btn-line" href="/docs/quickstart">
						Read the quickstart
					</Link>
				</div>
			</section>
		)
	}

	return (
		<form className="panel" onSubmit={submit}>
			<h2>Create an account</h2>
			<p className="sub">Takes a few seconds. No card, no password.</p>
			<div className="form">
				<label>
					Name or company
					<input
						name="name"
						required
						maxLength={120}
						autoComplete="organization"
					/>
				</label>
				<label>
					<span>
						Email <span className="opt">(optional, for account notices)</span>
					</span>
					<input
						name="email"
						type="email"
						maxLength={254}
						autoComplete="email"
					/>
				</label>
				<label>
					<span>
						Invite code{" "}
						<span className="opt">(if this server asks for one)</span>
					</span>
					<input name="invite" maxLength={200} autoComplete="off" />
				</label>
				{error && (
					<p className="err" role="alert">
						{error}
					</p>
				)}
				<button className="btn btn-ink" type="submit" disabled={busy}>
					{busy ? "Creating your account" : "Create account"}
				</button>
			</div>
		</form>
	)
}
