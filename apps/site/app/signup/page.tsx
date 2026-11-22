import type { Metadata } from "next"
import SignupForm from "./signup-form"

export const metadata: Metadata = {
	title: "Get an API key — Smaran",
	description: "Create a Smaran account and get an API key.",
}

export default function SignupPage() {
	return (
		<main className="signup-wrap">
			<a href="/" className="signup-back">
				← Smaran
			</a>
			<h1 className="signup-title">Get an API key</h1>
			<p className="signup-lead">
				Creates an account on this Smaran server and shows your first key once,
				with your plan&apos;s limits.
			</p>
			<SignupForm apiUrl={process.env.NEXT_PUBLIC_SMARAN_API_URL ?? ""} />
		</main>
	)
}
