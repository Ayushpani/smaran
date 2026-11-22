import { Architecture } from "@/components/landing/architecture"
import { Backdrop } from "@/components/landing/backdrop"
import { CodeSection, Start } from "@/components/landing/code-and-start"
import { Hero } from "@/components/landing/hero"
import { Integrations } from "@/components/landing/integrations"
import { Magnetic } from "@/components/landing/magnetic"
import { Marquee } from "@/components/landing/marquee"
import { Numbers } from "@/components/landing/numbers"
import { Recall } from "@/components/landing/recall"
import { Remembrance } from "@/components/landing/remembrance"
import { Story } from "@/components/landing/story"
import { Tour } from "@/components/landing/tour"
import { SiteFooter } from "@/components/site/footer"
import { SiteNav } from "@/components/site/nav"

export default function Home() {
	return (
		<>
			<Backdrop />
			<SiteNav overHero />
			<main>
				<Hero />
				<Marquee />
				<Architecture />
				<Tour />
				<Story />
				<Remembrance />
				<Recall />
				<Integrations />
				<Numbers />
				<CodeSection />
				<Start />
			</main>
			<SiteFooter />
			<Magnetic />
		</>
	)
}
