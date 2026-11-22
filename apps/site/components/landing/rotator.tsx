"use client"

import { useEffect, useRef } from "react"
import { el, graphemes, gsap, motionOn } from "@/lib/gsap"

/**
 * Cycles through phrases: the current one squeezes narrow and drops out
 * letter by letter, the next rises in and widens.
 */
export function Rotator({
	phrases,
	hold = 2.4,
}: {
	phrases: string[]
	hold?: number
}) {
	const ref = useRef<HTMLSpanElement>(null)
	useEffect(() => {
		const box = ref.current
		if (!box || !motionOn() || phrases.length < 2) return
		let i = 0
		let tl: gsap.core.Timeline | null = null
		let visible = true
		const build = (text: string) => {
			const words = text.split(" ")
			const frag = document.createDocumentFragment()
			words.forEach((w, k) => {
				if (k) frag.append(" ")
				const word = el("span", "rot-w")
				for (const g of graphemes(w)) word.append(el("span", "rot-c", g))
				frag.append(word)
			})
			return frag
		}
		const next = () => {
			if (!visible) {
				tl = gsap.timeline({ delay: 0.5, onComplete: next })
				return
			}
			const out = box.querySelectorAll(".rot-c")
			i = (i + 1) % phrases.length
			tl = gsap.timeline({ onComplete: next })
			tl.to(out, {
				yPercent: 80,
				opacity: 0,
				"--wd": 75,
				duration: 0.42,
				ease: "power3.in",
				stagger: { each: 0.012, from: "end" },
			})
			tl.call(() => {
				box.replaceChildren(build(phrases[i]!))
			})
			tl.fromTo(
				() => box.querySelectorAll(".rot-c"),
				{ yPercent: -90, opacity: 0, "--wd": 75 },
				{
					yPercent: 0,
					opacity: 1,
					"--wd": 80,
					duration: 0.8,
					ease: "expo.out",
					stagger: 0.016,
				},
			)
			tl.to({}, { duration: hold })
		}
		box.replaceChildren(build(phrases[0]!))
		tl = gsap.timeline({ delay: hold + 0.8, onComplete: next })
		const io = new IntersectionObserver(([e]) => {
			visible = !!e?.isIntersecting
		})
		io.observe(box)
		return () => {
			tl?.kill()
			io.disconnect()
		}
	}, [phrases, hold])
	return (
		<span ref={ref} className="rot" aria-hidden="true">
			{phrases[0]}
		</span>
	)
}
