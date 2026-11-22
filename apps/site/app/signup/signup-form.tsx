"use client"

import { type FormEvent, useState } from "react"

interface SignupResult {
	tenantId: string
	keyId: string
	apiKey: string
	limits: { memories: number; requestsPerMinute: number }
}

export default function SignupForm({ apiUrl }: { apiUrl: string }) {
	const [state, setState] = useState<"idle" | "busy" | "done">("idle")
	const [error, setError] = useState<string | null>(null)
	const [result, setResult] = useState<SignupResult | null>(null)
	const [copied, setCopied] = useState(false)

	if (!apiUrl) {
		return (
			<p className="signup-error" role="alert">
				Signup isn&apos;t configured on this site (NEXT_PUBLIC_SMARAN_API_URL is
				unset).
			</p>
		)
	}

	async function submit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault()
		const form = new FormData(e.currentTarget)
		const body: Record<string, string> = {
			name: String(form.get("name") ?? ""),
		}
		for (const k of ["email", "invite"]) {
			const v = String(form.get(k) ?? "").trim()
			if (v) body[k] = v
		}
		setState("busy")
		setError(null)
		try {
			const res = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/signup`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				setError(json?.error?.message ?? `Signup failed (HTTP ${res.status}).`)
				setState("idle")
				return
			}
			setResult(json as SignupResult)
			setState("done")
		} catch {
			setError(
				"Couldn't reach the Smaran API. Check your connection and try again.",
			)
			setState("idle")
		}
	}

	if (state === "done" && result) {
		return (
			<section className="signup-card" aria-live="polite">
				<h2>Your API key</h2>
				<p className="signup-warn">
					Copy it now — it won&apos;t be shown again.
				</p>
				<div className="signup-key">
					<code>{result.apiKey}</code>
					<button
						type="button"
						onClick={() => {
							void navigator.clipboard
								.writeText(result.apiKey)
								.then(() => setCopied(true))
						}}
					>
						{copied ? "Copied" : "Copy"}
					</button>
				</div>
				<p className="signup-fine">
					Account {result.tenantId} · {result.limits.memories.toLocaleString()}{" "}
					memories · {result.limits.requestsPerMinute} requests/min
				</p>
				<pre className="signup-code">{`curl ${apiUrl}/v1/memories \\
  -H "Authorization: Bearer ${result.apiKey.slice(0, 10)}…" \\
  -H "Content-Type: application/json" \\
  -d '{"userId":"u1","text":"I prefer window seats."}'`}</pre>
				<p>
					Next: <a href="/docs/quickstart">Quickstart</a> ·{" "}
					<a href="/docs/sdk">TypeScript SDK</a> ·{" "}
					<a href="/docs/api">REST API</a>
				</p>
			</section>
		)
	}

	return (
		<form className="signup-card" onSubmit={submit}>
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
				Email{" "}
				<span className="signup-opt">(optional — for account notices)</span>
				<input name="email" type="email" maxLength={254} autoComplete="email" />
			</label>
			<label>
				Invite code{" "}
				<span className="signup-opt">(if this server requires one)</span>
				<input name="invite" maxLength={200} autoComplete="off" />
			</label>
			{error && (
				<p className="signup-error" role="alert">
					{error}
				</p>
			)}
			<button type="submit" disabled={state === "busy"}>
				{state === "busy" ? "Creating…" : "Create account"}
			</button>
		</form>
	)
}
