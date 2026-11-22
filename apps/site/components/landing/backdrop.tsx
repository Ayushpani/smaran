"use client"

import { useEffect, useRef } from "react"
import { gsap, motionOn, ScrollTrigger } from "@/lib/gsap"
import { PALETTE_EVENT, token } from "@/lib/palette"

const VAR: Record<string, string> = {
	hero: "--hero",
	deep: "--deep",
	paper: "--paper",
}

/**
 * One fixed colour field behind the landing page. Each section declares a
 * tone; as it reaches the middle of the screen the field eases to that tone,
 * so the page changes colour as you scroll instead of cutting between blocks.
 */
export function Backdrop() {
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const bd = ref.current
		if (!bd || !motionOn()) return
		document.documentElement.classList.add("bd")
		let tone = "hero"
		const go = (t: string, instant = false) => {
			tone = t
			gsap.to(bd, {
				backgroundColor: token(VAR[t] ?? "--paper"),
				duration: instant ? 0 : 0.9,
				ease: "power2.inOut",
				overwrite: true,
			})
		}
		const ctx = gsap.context(() => {
			for (const s of document.querySelectorAll<HTMLElement>("[data-tone]")) {
				ScrollTrigger.create({
					trigger: s,
					start: "top 55%",
					end: "bottom 55%",
					onToggle: (self) => {
						if (self.isActive) go(s.dataset.tone ?? "paper")
					},
				})
			}
		})
		go("hero", true)
		const onPalette = () => go(tone, true)
		window.addEventListener(PALETTE_EVENT, onPalette)
		return () => {
			window.removeEventListener(PALETTE_EVENT, onPalette)
			document.documentElement.classList.remove("bd")
			ctx.revert()
		}
	}, [])
	return <div ref={ref} className="backdrop" aria-hidden="true" />
}
