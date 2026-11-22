"use client"

import Link from "next/link"
import { type FormEvent, useEffect, useRef } from "react"
import { el, graphemes, gsap, motionOn, rand } from "@/lib/gsap"
import { PALETTE_EVENT, token } from "@/lib/palette"
import { correct } from "./correct"
import { HeroField, RIPPLE_EVENT } from "./field"
import { Rotator } from "./rotator"

const EXAMPLES = [
	"my flat is 21, no wait, 12, B wing",
	"mera pin hai ek do teen, nahi, teen do ek",
	"send it to priya@gmial.com, sorry, priya@gmail.com",
]
const PHRASES = [
	"hears the correction.",
	"keeps every fact’s history.",
	"speaks Hindi and Hinglish.",
	"plugs into your stack.",
	"runs on your own Postgres.",
]
const PRESETS = [
	"my seat is 14C, sorry, 41C",
	"call me at 98201 33410, actually, 98201 33401",
	"order number char saat do, matlab, char saat paanch",
]

interface Wave {
	pulse(e: number): void
	flash(): void
	stop(): void
}

function startWave(cv: HTMLCanvasElement, animate: boolean): Wave {
	const ctx = cv.getContext("2d")
	let energy = 0
	let tint = 0
	let raf = 0
	let on = true
	let hoverX = -1
	let fg = token("--hero-fg")
	let fix = token("--fix")
	const size = () => {
		const dpr = Math.min(2, window.devicePixelRatio || 1)
		cv.width = cv.clientWidth * dpr
		cv.height = cv.clientHeight * dpr
		ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
	}
	const draw = (now: number) => {
		if (!ctx) return
		const w = cv.clientWidth
		const h = cv.clientHeight
		const step = 7
		const n = Math.floor(w / step)
		ctx.clearRect(0, 0, w, h)
		energy *= 0.93
		tint *= 0.955
		for (let i = 0; i < n; i++) {
			const x = i * step
			const env = Math.sin((i / n) * Math.PI) ** 0.6
			const m =
				0.5 +
				0.5 *
					Math.sin(i * 0.41 + now * 0.013) *
					Math.sin(i * 0.13 - now * 0.005)
			// The cursor is a second voice: bars swell near it.
			const near = hoverX < 0 ? 0 : Math.max(0, 1 - Math.abs(x - hoverX) / 90)
			const bh = Math.max(2, h * (0.04 + energy * env * m + near * 0.55 * m))
			ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, energy * 1.5 + near + 0.1)
			ctx.fillStyle = tint > 0.25 && m > 0.35 ? fix : fg
			ctx.fillRect(x, (h - bh) / 2, 3, bh)
		}
		if (on && animate) raf = requestAnimationFrame(draw)
	}
	const onMove = (e: PointerEvent) => {
		const r = cv.getBoundingClientRect()
		hoverX = e.clientX - r.left
	}
	const onLeave = () => {
		hoverX = -1
	}
	const onPalette = () => {
		fg = token("--hero-fg")
		fix = token("--fix")
		if (!animate) draw(0)
	}
	const onResize = () => {
		size()
		if (!animate) draw(0)
	}
	size()
	cv.addEventListener("pointermove", onMove)
	cv.addEventListener("pointerleave", onLeave)
	window.addEventListener("resize", onResize)
	window.addEventListener(PALETTE_EVENT, onPalette)
	const io = new IntersectionObserver(([e]) => {
		on = !!e?.isIntersecting
		cancelAnimationFrame(raf)
		if (on && animate) raf = requestAnimationFrame(draw)
	})
	if (animate) io.observe(cv)
	else draw(0)
	return {
		pulse: (e) => {
			energy = Math.min(1, energy + e)
		},
		flash: () => {
			tint = 1
		},
		stop: () => {
			on = false
			cancelAnimationFrame(raf)
			io.disconnect()
			cv.removeEventListener("pointermove", onMove)
			cv.removeEventListener("pointerleave", onLeave)
			window.removeEventListener("resize", onResize)
			window.removeEventListener(PALETTE_EVENT, onPalette)
		},
	}
}

export function Hero() {
	const stageRef = useRef<HTMLParagraphElement>(null)
	const textRef = useRef<HTMLParagraphElement>(null)
	const memRef = useRef<HTMLUListElement>(null)
	const exRef = useRef<HTMLSpanElement>(null)
	const waveRef = useRef<HTMLCanvasElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const play = useRef<(s: string) => void>(() => {})
	const waveApi = useRef<Wave | null>(null)

	useEffect(() => {
		const stage = stageRef.current
		const said = textRef.current
		const mem = memRef.current
		const ex = exRef.current
		const cv = waveRef.current
		if (!stage || !said || !mem || !ex || !cv) return
		const motion = motionOn()
		const wave = startWave(cv, motion)
		waveApi.current = wave
		let tl: gsap.core.Timeline | null = null
		let idx = 0
		let callNo = 410
		let alive = true

		const wordNode = (text: string, cls: string) => {
			const w = el("span", `w ${cls}`)
			for (const g of graphemes(text)) w.append(el("span", "c", g))
			w.append(el("i", "strike"))
			return w
		}
		const pushMemory = (text: string, meta: string, instant = false) => {
			const li = el("li")
			li.append(el("span", "", text), el("span", "meta", meta))
			mem.prepend(li)
			if (!instant && motion)
				gsap.from(li, { opacity: 0, y: -18, duration: 0.6, ease: "expo.out" })
			while (mem.children.length > 3) mem.lastElementChild?.remove()
		}
		const still = (sentence: string) => {
			const r = correct(sentence)
			stage.replaceChildren()
			r.out.forEach((j, k) => {
				if (k) stage.append(" ")
				stage.append(
					wordNode(r.kept[k] ?? "", r.fixes.has(j) ? "fix landed" : ""),
				)
			})
			said.textContent = `Stored: ${r.kept.join(" ")}`
			return r
		}
		const collapse = (nodes: HTMLElement[], gone: Set<number>) => {
			const keep = nodes.filter((_, i) => !gone.has(i))
			const first = keep.map((n) => n.getBoundingClientRect())
			for (const i of gone) {
				const n = nodes[i]
				if (!n) continue
				const prev = n.previousSibling
				const next = n.nextSibling
				if (prev && prev.nodeType === 3) prev.remove()
				else if (next && next.nodeType === 3) next.remove()
				n.remove()
			}
			keep.forEach((n, k) => {
				const b = n.getBoundingClientRect()
				const a = first[k]
				if (!a) return
				gsap.fromTo(
					n,
					{ x: a.left - b.left, y: a.top - b.top },
					{ x: 0, y: 0, duration: 0.85, ease: "expo.inOut" },
				)
			})
		}
		const perform = (sentence: string, onDone: () => void) => {
			tl?.kill()
			gsap.killTweensOf(stage.querySelectorAll("*"))
			const r = correct(sentence)
			stage.replaceChildren()
			said.textContent = ""
			const nodes: HTMLElement[] = []
			tl = gsap.timeline({
				onComplete: () => {
					if (alive) onDone()
				},
			})
			let t = 0.2
			r.toks.forEach((tok, i) => {
				const cls = r.marks[i] === "cue" ? "cue" : r.fixes.has(i) ? "fix" : ""
				const w = wordNode(tok, cls)
				nodes[i] = w
				if (r.marks[i] === "cue" && (i === 0 || r.marks[i - 1] !== "cue"))
					t += 0.28 // the hesitation before a correction
				tl?.call(
					() => {
						if (stage.childNodes.length) stage.append(" ")
						stage.append(w)
						wave.pulse(0.35 + tok.length * 0.04)
					},
					undefined,
					t,
				)
				tl?.fromTo(
					w.querySelectorAll(".c"),
					{ yPercent: 70, opacity: 0, filter: "blur(8px)" },
					{
						yPercent: 0,
						opacity: 1,
						filter: "blur(0px)",
						duration: 0.5,
						stagger: 0.022,
						ease: "expo.out",
						immediateRender: false,
					},
					t,
				)
				t += 0.14 + Math.min(0.3, tok.length * 0.028)
				const victims = (r.retractAt[i] ?? [])
					.map((j) => nodes[j])
					.filter((v): v is HTMLElement => !!v)
				if (victims.length) {
					t += 0.15
					tl?.call(
						() => {
							wave.flash()
							const r = victims[0]?.getBoundingClientRect()
							if (r)
								window.dispatchEvent(
									new CustomEvent(RIPPLE_EVENT, {
										detail: {
											x: r.left + r.width / 2,
											y: r.top + r.height / 2,
										},
									}),
								)
						},
						undefined,
						t,
					)
					tl?.to(
						victims.map((v) => v.querySelector(".strike")),
						{ scaleX: 1, duration: 0.32, ease: "power3.inOut" },
						t,
					)
					tl?.to(
						victims,
						{ "--wd": 75, duration: 0.4, ease: "power2.inOut" },
						t + 0.3,
					)
					const parts = victims.flatMap((v) => [
						...v.querySelectorAll(".c, .strike"),
					])
					tl?.to(
						parts,
						{
							y: () => rand(140, 320),
							x: () => rand(-60, 60),
							rotation: () => rand(-80, 80),
							opacity: 0,
							duration: 1,
							ease: "power2.in",
							stagger: { each: 0.025, from: "random" },
						},
						t + 0.75,
					)
					t += 1.05
				}
			})
			t += 0.55
			const gone = new Set(
				r.toks.map((_, i) => i).filter((i) => r.marks[i] !== "word"),
			)
			tl.call(() => collapse(nodes, gone), undefined, t)
			t += 0.95
			tl.call(
				() => {
					const last = nodes[r.out[r.out.length - 1] ?? -1]
					const lc = last ? last.querySelectorAll(".c") : []
					const tail = lc[lc.length - 1]
					if (tail && /[,;]/.test(tail.textContent ?? "")) tail.remove()
					for (const j of r.out)
						if (r.fixes.has(j)) nodes[j]?.classList.add("landed")
					said.textContent = `Stored: ${r.kept.join(" ")}`
				},
				undefined,
				t,
			)
			t += 0.5
			tl.call(
				() => pushMemory(r.kept.join(" "), `call ${++callNo}, stored`),
				undefined,
				t,
			)
			t += 2.8
			tl.call(
				() => {
					gsap.to(stage.querySelectorAll(".c"), {
						yPercent: -60,
						opacity: 0,
						duration: 0.45,
						stagger: 0.012,
						ease: "power2.in",
					})
				},
				undefined,
				t,
			)
			tl.call(() => {}, undefined, t + 1)
		}
		const loop = () => {
			ex.textContent = `Example ${idx + 1} of ${EXAMPLES.length}`
			perform(EXAMPLES[idx]!, () => {
				idx = (idx + 1) % EXAMPLES.length
				loop()
			})
		}

		play.current = (s: string) => {
			if (!motion) {
				const r = still(s)
				pushMemory(r.kept.join(" "), "your sentence", true)
				return
			}
			ex.textContent = "Your sentence"
			perform(s, loop)
		}

		let io: IntersectionObserver | null = null
		let startTimer = 0
		if (motion) {
			let started = false
			io = new IntersectionObserver(([e]) => {
				if (e?.isIntersecting && !started) {
					started = true
					startTimer = window.setTimeout(loop, 600)
				}
				if (tl) {
					if (e?.isIntersecting) tl.resume()
					else tl.pause()
				}
			})
			io.observe(stage)
		} else {
			for (const [k, s] of [...EXAMPLES].reverse().entries())
				pushMemory(correct(s).kept.join(" "), `call ${412 - k}, stored`, true)
			still(EXAMPLES[0]!)
		}
		return () => {
			alive = false
			clearTimeout(startTimer)
			io?.disconnect()
			tl?.kill()
			wave.stop()
		}
	}, [])

	const submit = (e: FormEvent) => {
		e.preventDefault()
		const v = inputRef.current?.value.trim()
		if (v) play.current(v)
	}

	return (
		<section className="hero tone-hero" data-tone="hero" id="top">
			<HeroField />
			<div className="wrap">
				<div className="hero-top">
					<h1 aria-label="Memory for voice agents. It hears the correction, keeps every fact’s history, speaks Hindi and Hinglish, plugs into your stack and runs on your own Postgres.">
						<span aria-hidden="true">Memory for voice agents that</span>
						<Rotator phrases={PHRASES} />
					</h1>
					<div className="hero-side">
						<p className="lede">
							Smaran saves what callers say the way they meant it, and brings it
							back on the next call: corrections applied, every fact dated, in
							English, Hindi and Hinglish. Self-hosted, with ready-made pieces
							for Vapi, LiveKit, Pipecat, OpenAI, Anthropic, Gemini and more.
						</p>
						<div className="actions">
							<Link className="btn btn-solid" href="/signup">
								Get an API key
							</Link>
							<Link className="btn btn-ghost" href="/docs/quickstart">
								Run it in one command
							</Link>
						</div>
					</div>
				</div>

				<div className="live">
					<div className="live-head">
						<span className="rec">What the caller says</span>
						<span ref={exRef}>Example 1 of 3</span>
					</div>
					<canvas ref={waveRef} className="wave" />
					<p className="stage" ref={stageRef} aria-hidden="true" />
					<p className="vh" ref={textRef} aria-live="polite" />

					<div className="hero-bottom">
						<div>
							<p className="mem-title">What Smaran stored</p>
							<ul className="mem" ref={memRef} />
						</div>
						<form className="try" onSubmit={submit}>
							<label htmlFor="try-input">
								Say something and change your mind
							</label>
							<div className="try-row">
								<input
									id="try-input"
									ref={inputRef}
									autoComplete="off"
									maxLength={120}
									defaultValue="my seat is 14C, sorry, 41C"
									onKeyDown={() => waveApi.current?.pulse(0.12)}
								/>
								<button className="btn btn-solid" type="submit">
									Play it
								</button>
							</div>
							<div className="presets">
								{PRESETS.map((p) => (
									<button
										key={p}
										type="button"
										onClick={() => {
											if (inputRef.current) inputRef.current.value = p
											play.current(p)
										}}
									>
										{p}
									</button>
								))}
							</div>
							<p className="fine">
								A simplified version of Smaran’s correction rules, running in
								your browser. Try “wait”, “sorry”, “I mean”, “nahi”, “matlab”.
							</p>
						</form>
					</div>
				</div>
			</div>
		</section>
	)
}
