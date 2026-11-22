import type { ReactNode } from "react"
import { SiteFooter } from "@/components/site/footer"
import { SiteNav } from "@/components/site/nav"

export default function DocsLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<div className="doc-root">
				<SiteNav />
				{children}
			</div>
			<SiteFooter />
		</>
	)
}
