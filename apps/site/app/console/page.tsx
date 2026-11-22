import type { Metadata } from "next"
import { SiteFooter } from "@/components/site/footer"
import { SiteNav } from "@/components/site/nav"
import { Console } from "./console"

export const metadata: Metadata = {
	title: "Console, Smaran",
	description:
		"Log in with your API key to see usage, manage keys and try save and recall.",
}

export default function ConsolePage() {
	return (
		<>
			<div className="acct">
				<SiteNav />
				<Console />
			</div>
			<SiteFooter />
		</>
	)
}
