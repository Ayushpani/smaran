import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/site/footer"
import { SiteNav } from "@/components/site/nav"
import SignupForm from "./signup-form"

export const metadata: Metadata = {
	title: "Get an API key, Smaran",
	description: "Create a Smaran account and get an API key.",
}

export default function SignupPage() {
	return (
		<>
			<div className="acct">
				<SiteNav />
				<div className="wrap">
					<div className="acct-hero">
						<h1>Get an API key.</h1>
						<p>
							Creates an account on this Smaran server and shows your first key
							once, with your plan’s limits. Then the console is one click away.
						</p>
					</div>
					<div className="acct-grid">
						<SignupForm apiUrl={process.env.NEXT_PUBLIC_SMARAN_API_URL ?? ""} />
						<div className="side-list">
							<div>
								<b>Free plan</b>
								<span>
									The server’s free limits apply: by default 10,000 memories and
									120 requests a minute.
								</span>
							</div>
							<div>
								<b>Already have a key?</b>
								<span>
									<Link href="/console">Log in to the console</Link> to see
									usage and manage keys.
								</span>
							</div>
							<div>
								<b>Rather run it yourself?</b>
								<span>
									Smaran is open source. The{" "}
									<Link href="/docs/quickstart">sandbox</Link> needs no account
									at all, and <Link href="/docs/self-host">self-hosting</Link>{" "}
									runs on your own Postgres.
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
			<SiteFooter />
		</>
	)
}
