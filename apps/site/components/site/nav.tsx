"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { PaletteSwitch } from "./palette-switch"

/**
 * Sticky site navigation. Over the landing hero it starts transparent in
 * the hero colour; once the page scrolls it turns into a frosted paper bar,
 * and it tucks away while scrolling down.
 */
export function SiteNav({ overHero = false }: { overHero?: boolean }) {
	const path = usePathname()
	const [solid, setSolid] = useState(!overHero)
	const [hide, setHide] = useState(false)
	const last = useRef(0)
	useEffect(() => {
		const on = () => {
			const y = window.scrollY
			setSolid(!overHero || y > 40)
			setHide(y > 400 && y > last.current + 4)
			if (y < last.current - 4 || y < 400) setHide(false)
			last.current = y
		}
		on()
		window.addEventListener("scroll", on, { passive: true })
		return () => window.removeEventListener("scroll", on)
	}, [overHero])
	const cur = (href: string) =>
		path === href || (href !== "/" && path.startsWith(href))
			? "page"
			: undefined
	return (
		<header
			className={`site-nav${solid ? " solid" : ""}${hide ? " hide" : ""}`}
		>
			<div className="wrap row">
				<Link className="wordmark" href="/" aria-label="Smaran home">
					smaran{" "}
					<span className="deva" lang="hi">
						स्मरण
					</span>
				</Link>
				<nav aria-label="Main">
					<Link className="hide-sm" href="/#architecture">
						How it works
					</Link>
					<Link href="/docs" aria-current={cur("/docs")}>
						Docs
					</Link>
					<a className="hide-sm" href="https://github.com/Ayushpani/smaran">
						GitHub
					</a>
					<Link href="/console" aria-current={cur("/console")}>
						Log in
					</Link>
					<PaletteSwitch />
					<Link className="btn btn-solid btn-sm" href="/signup">
						Get a key
					</Link>
				</nav>
			</div>
		</header>
	)
}
