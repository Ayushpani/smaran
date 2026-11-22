"use client"

import { useEffect, useState } from "react"
import type { TocItem } from "@/lib/docs"

export function Toc({ items }: { items: TocItem[] }) {
	const [on, setOn] = useState<string | null>(null)
	useEffect(() => {
		const heads = items
			.map((it) => document.getElementById(it.id))
			.filter((h): h is HTMLElement => !!h)
		if (!heads.length) return
		const io = new IntersectionObserver(
			(entries) => {
				const vis = entries.filter((e) => e.isIntersecting)
				if (vis[0]) setOn(vis[0].target.id)
			},
			{ rootMargin: "-80px 0px -70% 0px" },
		)
		for (const h of heads) io.observe(h)
		return () => io.disconnect()
	}, [items])
	if (items.length === 0) return null
	return (
		<aside className="doc-toc" aria-label="On this page">
			<div className="doc-toc-h">On this page</div>
			<ul>
				{items.map((it) => (
					<li key={it.id} className={`doc-toc-l${it.level}`}>
						<a href={`#${it.id}`} className={on === it.id ? "on" : undefined}>
							{it.text}
						</a>
					</li>
				))}
			</ul>
		</aside>
	)
}
