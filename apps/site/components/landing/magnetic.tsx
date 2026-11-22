"use client"

import { useEffect } from "react"
import { gsap, motionOn } from "@/lib/gsap"

/** Primary buttons on the landing page lean toward a nearby cursor. */
export function Magnetic() {
	useEffect(() => {
		if (!motionOn() || !window.matchMedia("(pointer: fine)").matches) return
		const els = [
			...document.querySelectorAll<HTMLElement>("main .btn-solid, main .path"),
		]
		const offs = els.map((b) => {
			const x = gsap.quickTo(b, "x", { duration: 0.5, ease: "power3" })
			const y = gsap.quickTo(b, "y", { duration: 0.5, ease: "power3" })
			const move = (e: PointerEvent) => {
				const r = b.getBoundingClientRect()
				x((e.clientX - (r.left + r.width / 2)) * 0.25)
				y((e.clientY - (r.top + r.height / 2)) * 0.35)
			}
			const leave = () => {
				x(0)
				y(0)
			}
			b.addEventListener("pointermove", move)
			b.addEventListener("pointerleave", leave)
			return () => {
				b.removeEventListener("pointermove", move)
				b.removeEventListener("pointerleave", leave)
			}
		})
		return () => {
			for (const off of offs) off()
		}
	}, [])
	return null
}
