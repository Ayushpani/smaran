"use client"

import { useEffect, useRef } from "react"

/** Film grain over everything. Its pattern jumps as the page scrolls. */
export function Grain() {
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		let lastY = window.scrollY
		const on = () => {
			const y = window.scrollY
			if (Math.abs(y - lastY) < 60) return
			lastY = y
			const el = ref.current
			if (!el) return
			el.style.setProperty("--gx", `${Math.round(Math.random() * 200 - 100)}px`)
			el.style.setProperty("--gy", `${Math.round(Math.random() * 200 - 100)}px`)
		}
		window.addEventListener("scroll", on, { passive: true })
		return () => window.removeEventListener("scroll", on)
	}, [])
	return <div ref={ref} className="grain" aria-hidden="true" />
}
