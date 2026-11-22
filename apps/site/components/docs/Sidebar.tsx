"use client"

import Link from "next/link"
import { useState } from "react"
import type { SidebarSection } from "@/lib/docs"

export function Sidebar({
	current,
	sections,
}: {
	current: string
	sections: SidebarSection[]
}) {
	const [open, setOpen] = useState(false)
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
											className={`doc-link${active ? " on" : ""}${it.stub ? " stub" : ""}`}
											aria-current={active ? "page" : undefined}
											onClick={() => setOpen(false)}
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
