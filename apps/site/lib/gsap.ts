"use client"

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }

/** True when animation is on: set before paint unless reduced motion is requested. */
export function motionOn(): boolean {
	return (
		typeof document !== "undefined" &&
		document.documentElement.classList.contains("motion")
	)
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a)

const seg =
	typeof Intl !== "undefined" && "Segmenter" in Intl
		? new Intl.Segmenter(undefined, { granularity: "grapheme" })
		: null
/** Split into user-perceived characters, so Devanagari conjuncts stay whole. */
export function graphemes(s: string): string[] {
	return seg ? [...seg.segment(s)].map((x) => x.segment) : [...s]
}

export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	cls?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const n = document.createElement(tag)
	if (cls) n.className = cls
	if (text != null) n.textContent = text
	return n
}
