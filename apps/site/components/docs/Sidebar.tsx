"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import type { SidebarSection } from "@/lib/docs"

export function Sidebar({ sections }: { sections: SidebarSection[] }) {
	const path = usePathname()
	const current = path.replace(/^\/|\/$/g, "") || "docs"
	const [open, setOpen] = useState(false)
	const navRef = useRef<HTMLElement>(null)
	const first = useRef(true)

	// On first load (or a direct link), bring the active page into view inside
	// the sidebar. After that the sidebar keeps whatever scroll you left it at.
	useEffect(() => {
		if (!first.current) return
		first.current = false
		const nav = navRef.current
		const on = nav?.querySelector<HTMLElement>(".doc-link.on")
		if (!nav || !on) return
		const n = nav.getBoundingClientRect()
		const r = on.getBoundingClientRect()
		if (r.top < n.top || r.bottom > n.bottom)
			nav.scrollTop += r.top - n.top - n.height / 3
	}, [])

	return (
		<div>
			<button
				type="button"
				className="btn btn-line btn-sm doc-menu"
				aria-expanded={open}
				aria-controls="doc-sidebar"
				onClick={() => setOpen((o) => !o)}
			>
				{open ? "Close menu" : "Docs menu"}
			</button>
			<nav
				id="doc-sidebar"
				ref={navRef}
				className={`doc-sidebar${open ? " open" : ""}`}
				aria-label="Docs navigation"
			>
				{sections.map((sec) => (
					<div key={sec.section} className="doc-sec">
						<div className="doc-sec-h">{sec.section}</div>
						<ul>
							{sec.items.map((it) => {
								const active = current === it.slug
								return (
									<li key={it.slug}>
										<Link
											href={`/${it.slug}`}
											scroll={false}
											className={`doc-link${active ? " on" : ""}${it.stub ? " stub" : ""}`}
											aria-current={active ? "page" : undefined}
											onClick={() => {
												setOpen(false)
												window.scrollTo({ top: 0 })
											}}
										>
											{it.title}
											{it.stub && <span className="doc-stub">soon</span>}
										</Link>
									</li>
								)
							})}
						</ul>
					</div>
				))}
			</nav>
		</div>
	)
}
