"use client"

import { useEffect, useRef } from "react"
import { motionOn } from "@/lib/gsap"
import { PALETTE_EVENT, token } from "@/lib/palette"

export const RIPPLE_EVENT = "smaran:ripple"

/**
 * A field of points behind the hero. Points lean away from the cursor and
 * spring back; a correction in the live sentence sends a ripple through it.
 * Sleeps when nothing is moving.
 */
export function HeroField() {
	const ref = useRef<HTMLCanvasElement>(null)
	useEffect(() => {
		const cv = ref.current
		const host = cv?.parentElement
		if (!cv || !host || !motionOn()) return
		const ctx = cv.getContext("2d")
		if (!ctx) return
		const GAP = 30
		// On touch screens the field stays invisible until a tap or a correction ripples it.
		const base = window.matchMedia("(pointer: coarse)").matches ? 0 : 0.16
		let W = 0
		let H = 0
		let pts: {
			x: number
			y: number
			dx: number
			dy: number
			vx: number
			vy: number
		}[] = []
		let mx = -9999
		let my = -9999
		let raf = 0
		let awake = false
		let visible = true
		let color = token("--hero-fg")
		let accent = token("--fix")
		const ripples: { x: number; y: number; t: number }[] = []

		const build = () => {
			const dpr = Math.min(2, window.devicePixelRatio || 1)
			W = host.clientWidth
			H = host.clientHeight
			cv.width = W * dpr
			cv.height = H * dpr
			cv.style.width = `${W}px`
			cv.style.height = `${H}px`
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			pts = []
			for (let y = GAP / 2; y < H; y += GAP)
				for (let x = GAP / 2; x < W; x += GAP)
					pts.push({ x, y, dx: 0, dy: 0, vx: 0, vy: 0 })
			wake()
		}
		const wake = () => {
			if (awake || !visible) return
			awake = true
			raf = requestAnimationFrame(tick)
		}
		const tick = (now: number) => {
			ctx.clearRect(0, 0, W, H)
			let energy = 0
			for (let i = ripples.length - 1; i >= 0; i--)
				if (now - ripples[i]!.t > 1800) ripples.splice(i, 1)
			for (const p of pts) {
				// cursor push
				const ddx = p.x - mx
				const ddy = p.y - my
				const d2 = ddx * ddx + ddy * ddy
				if (d2 < 160 * 160) {
					const d = Math.sqrt(d2) || 1
					const f = (1 - d / 160) * 2.2
					p.vx += (ddx / d) * f
					p.vy += (ddy / d) * f
				}
				// ripples: a ring travelling outward
				let lit = 0
				for (const r of ripples) {
					const age = (now - r.t) / 1000
					const radius = age * 700
					const rx = p.x - r.x
					const ry = p.y - r.y
					const dist = Math.sqrt(rx * rx + ry * ry) || 1
					const band = Math.abs(dist - radius)
					if (band < 40) {
						const k = (1 - band / 40) * (1 - age / 1.8)
						p.vx += (rx / dist) * k * 3
						p.vy += (ry / dist) * k * 3
						lit = Math.max(lit, k)
					}
				}
				// spring home
				p.vx += -p.dx * 0.06
				p.vy += -p.dy * 0.06
				p.vx *= 0.86
				p.vy *= 0.86
				p.dx += p.vx
				p.dy += p.vy
				const m = Math.abs(p.dx) + Math.abs(p.dy)
				energy += m + Math.abs(p.vx) + Math.abs(p.vy)
				const size = 1.1 + Math.min(2.4, m * 0.09)
				ctx.globalAlpha = base + Math.min(0.5, m * 0.025) + lit * 0.5
				ctx.fillStyle = lit > 0.2 ? accent : color
				ctx.beginPath()
				ctx.arc(p.x + p.dx, p.y + p.dy, size, 0, Math.PI * 2)
				ctx.fill()
			}
			if (energy > 2 || ripples.length || mx > -9000) {
				raf = requestAnimationFrame(tick)
			} else {
				awake = false
				// one settled frame
				ctx.globalAlpha = 0.16
			}
		}
		const onMove = (e: PointerEvent) => {
			const r = host.getBoundingClientRect()
			mx = e.clientX - r.left
			my = e.clientY - r.top
			wake()
		}
		const onLeave = () => {
			mx = -9999
			my = -9999
			wake()
		}
		const onDown = (e: PointerEvent) => {
			const r = host.getBoundingClientRect()
			ripples.push({
				x: e.clientX - r.left,
				y: e.clientY - r.top,
				t: performance.now(),
			})
			wake()
		}
		const onRipple = (e: Event) => {
			const d = (e as CustomEvent<{ x: number; y: number }>).detail
			const r = host.getBoundingClientRect()
			ripples.push({ x: d.x - r.left, y: d.y - r.top, t: performance.now() })
			wake()
		}
		const onPalette = () => {
			color = token("--hero-fg")
			accent = token("--fix")
			wake()
		}
		const ro = new ResizeObserver(build)
		ro.observe(host)
		const io = new IntersectionObserver(([e]) => {
			visible = !!e?.isIntersecting
			if (visible) wake()
		})
		io.observe(host)
		host.addEventListener("pointermove", onMove)
		host.addEventListener("pointerleave", onLeave)
		host.addEventListener("pointerdown", onDown)
		window.addEventListener(RIPPLE_EVENT, onRipple)
		window.addEventListener(PALETTE_EVENT, onPalette)
		return () => {
			cancelAnimationFrame(raf)
			ro.disconnect()
			io.disconnect()
			host.removeEventListener("pointermove", onMove)
			host.removeEventListener("pointerleave", onLeave)
			host.removeEventListener("pointerdown", onDown)
			window.removeEventListener(RIPPLE_EVENT, onRipple)
			window.removeEventListener(PALETTE_EVENT, onPalette)
		}
	}, [])
	return <canvas ref={ref} className="hero-field" />
}
