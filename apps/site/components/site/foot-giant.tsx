"use client"

import { useEffect, useRef } from "react"
import { graphemes, gsap, motionOn } from "@/lib/gsap"

const WORD = "स्मरण"

/** The closing स्मरण: its letters rise out of the footer as it scrolls in. */
export function FootGiant() {
	const ref = useRef<HTMLParagraphElement>(null)
	useEffect(() => {
		const el = ref.current
		if (!el || !motionOn()) return
		const parts = el.querySelectorAll("span")
		const ctx = gsap.context(() => {
			gsap.fromTo(
				parts,
				{ yPercent: 70, opacity: 0 },
				{
					yPercent: 0,
					opacity: 1,
					ease: "expo.out",
					duration: 1.6,
					stagger: 0.12,
					scrollTrigger: { trigger: el, start: "top 95%", once: true },
				},
			)
		})
		return () => ctx.revert()
	}, [])
	return (
		<p ref={ref} className="foot-giant deva" lang="hi" aria-hidden="true">
			{graphemes(WORD).map((g, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed word
				<span key={i}>{g}</span>
			))}
		</p>
	)
}
