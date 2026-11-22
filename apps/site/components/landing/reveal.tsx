"use client"

import { type ElementType, useEffect, useRef } from "react"
import { gsap, motionOn, ScrollTrigger } from "@/lib/gsap"

/** A heading whose words rise out of a mask and widen as it scrolls in. */
export function Reveal({
	as: Tag = "h2",
	className = "h2",
	id,
	children,
}: {
	as?: ElementType
	className?: string
	id?: string
	children: string
}) {
	const ref = useRef<HTMLElement>(null)
	const words = children.split(/\s+/)
	useEffect(() => {
		const h = ref.current
		if (!h || !motionOn()) return
		const inner = h.querySelectorAll(".ri")
		const ctx = gsap.context(() => {
			gsap.set(inner, { yPercent: 115, "--wd": 75 })
			ScrollTrigger.create({
				trigger: h,
				start: "top 88%",
				once: true,
				onEnter: () =>
					gsap.to(inner, {
						yPercent: 0,
						"--wd": 84,
						duration: 1.15,
						ease: "expo.out",
						stagger: 0.07,
					}),
			})
		})
		return () => ctx.revert()
	}, [])
	return (
		<Tag ref={ref} className={className} id={id} aria-label={children}>
			{words.map((w, k) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static word list
				<span key={k}>
					{k > 0 && " "}
					<span className="rw" aria-hidden="true">
						<span className="ri">{w}</span>
					</span>
				</span>
			))}
		</Tag>
	)
}
