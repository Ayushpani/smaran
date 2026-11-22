import type { Metadata } from "next"
import { SiteFooter } from "@/components/site/footer"
import { SiteNav } from "@/components/site/nav"
import { Playground } from "./playground"

export const metadata: Metadata = {
	title: "Playground, Smaran",
	description:
		"Talk to a voice agent with Smaran memory, correct yourself, call again, and watch what it remembers next to the same agent without memory.",
}

export default function PlaygroundPage() {
	return (
		<>
			<div className="acct">
				<SiteNav />
				<Playground />
			</div>
			<SiteFooter />
		</>
	)
}
