import { Architecture } from "@/components/landing/architecture"
import { Backdrop } from "@/components/landing/backdrop"
import { CodeSection, Start } from "@/components/landing/code-and-start"
import { Hero } from "@/components/landing/hero"
import { Numbers } from "@/components/landing/numbers"
import { Recall } from "@/components/landing/recall"
import { Remembrance } from "@/components/landing/remembrance"
import { Story } from "@/components/landing/story"
import { SiteFooter } from "@/components/site/footer"
import { SiteNav } from "@/components/site/nav"

export default function Home() {
	return (
		<>
			<Backdrop />
			<SiteNav overHero />
			<main>
				<Hero />
				<Architecture />
				<Story />
				<Remembrance />
				<Recall />
				<Numbers />
				<CodeSection />
				<Start />
			</main>
			<SiteFooter />
		</>
	)
}
