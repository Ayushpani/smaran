import type { ReactNode } from "react"
import { Sidebar } from "@/components/docs/Sidebar"
import { SiteFooter } from "@/components/site/footer"
import { SiteNav } from "@/components/site/nav"
import { SIDEBAR } from "@/lib/docs"

/**
 * The sidebar lives in the layout, not the page, so it stays mounted while
 * you move between docs and keeps its scroll position.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<div className="doc-root">
				<SiteNav />
				<div className="doc-shell">
					<Sidebar sections={SIDEBAR} />
					{children}
				</div>
			</div>
			<SiteFooter />
		</>
	)
}
