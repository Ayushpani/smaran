"use client"

import { useEffect, useRef, useState } from "react"
import { gsap, motionOn, ScrollTrigger } from "@/lib/gsap"
import { Reveal } from "./reveal"

// Every value here is in RESULTS.md (LoCoMo, 1,536 questions, CPU only).
const SETTINGS = [
	{ id: "off", label: "No reranking", hit10: 71.3, hit1: 38.0, ms: 15 },
	{ id: "20", label: "Rerank top 20", hit10: 74.7, hit1: 51.0, ms: 98 },
	{ id: "40", label: "Rerank top 40", hit10: 77.3, hit1: 51.4, ms: 142 },
] as const
const BUDGET = 500
const SLOW = 5

function CountUp({
	value,
	suffix,
	dec = 0,
}: {
	value: number
	suffix: string
	dec?: number
}) {
	const ref = useRef<HTMLElement>(null)
	const shown = useRef(0)
	const armed = useRef(false)
	useEffect(() => {
		const n = ref.current
		if (!n) return
		if (!motionOn()) {
			n.textContent = `${value.toFixed(dec)}${suffix}`
			return
		}
		const o = { v: shown.current }
		const go = () =>
			gsap.to(o, {
				v: value,
				duration: armed.current ? 0.8 : 1.8,
				ease: "expo.out",
				overwrite: true,
				onUpdate: () => {
					shown.current = o.v
					n.textContent = `${o.v.toFixed(dec)}${suffix}`
				},
			})
		if (armed.current) {
			go()
			return
		}
		n.textContent = `${(0).toFixed(dec)}${suffix}`
		const st = ScrollTrigger.create({
			trigger: n,
			start: "top 90%",
			once: true,
			onEnter: () => {
				armed.current = true
				go()
			},
		})
		return () => st.kill()
	}, [value, suffix, dec])
	return <b ref={ref}>{`${value.toFixed(dec)}${suffix}`}</b>
}

export function Numbers() {
	const [sel, setSel] = useState(2)
	const raceRef = useRef<HTMLDivElement>(null)
	const s = SETTINGS[sel]!

	const race = () => {
		const bars = raceRef.current?.querySelectorAll<HTMLElement>(".track i")
		if (!bars) return
		for (const b of bars) {
			const ms = Number(b.dataset.ms)
			const to = Math.min(1, ms / BUDGET)
			if (!motionOn()) {
				b.style.transform = `scaleX(${to})`
				continue
			}
			gsap.killTweensOf(b)
			gsap.fromTo(
				b,
				{ scaleX: 0 },
				{ scaleX: to, duration: (ms * SLOW) / 1000, ease: "none" },
			)
		}
	}

	// First race when scrolled into view; again whenever the setting changes.
	const first = useRef(true)
	// biome-ignore lint/correctness/useExhaustiveDependencies: race reads the DOM for the current setting
	useEffect(() => {
		const r = raceRef.current
		if (!r) return
		if (first.current) {
			first.current = false
			if (!motionOn()) {
				race()
				return
			}
			gsap.set(r.querySelectorAll(".track i"), { scaleX: 0 })
			const st = ScrollTrigger.create({
				trigger: r,
				start: "top 75%",
				once: true,
				onEnter: race,
			})
			return () => st.kill()
		}
		race()
	}, [sel])

	return (
		<section
			className="section tone-paper"
			data-tone="paper"
			id="numbers"
			aria-labelledby="numbers-title"
		>
			<div className="wrap">
				<Reveal id="numbers-title">
					Measured. With the script to check it.
				</Reveal>
				<div className="nums">
					<div>
						<p className="big">
							<CountUp value={s.hit10} suffix="%" dec={1} />
						</p>
						<p className="big-cap">
							of 1,536 questions from the public LoCoMo benchmark had the right
							memory in the top 10.
						</p>
						<div className="minis">
							<div className="mini">
								<CountUp value={s.hit1} suffix="%" dec={1} />
								<span>right memory ranked first</span>
							</div>
							<div className="mini">
								<CountUp value={12} suffix=" ms" />
								<span>to save a statement</span>
							</div>
							<div className="mini">
								<CountUp value={s.ms} suffix=" ms" />
								<span>to recall, middle value</span>
							</div>
						</div>
					</div>
					<div className="tune" ref={raceRef}>
						<div className="tune-h">
							<p>Trade accuracy for speed, per request</p>
							<fieldset className="seg-ctl">
								<legend className="vh">Reranking</legend>
								{SETTINGS.map((x, k) => (
									<button
										key={x.id}
										type="button"
										aria-pressed={k === sel}
										onClick={() => setSel(k)}
									>
										{x.label}
									</button>
								))}
							</fieldset>
						</div>
						<div className="lane2">
							<p className="lt">
								<span>Recall, {s.label.toLowerCase()}</span>
								<b>{s.ms} ms</b>
							</p>
							<div className="track">
								<i data-ms={s.ms} />
							</div>
						</div>
						<div className="lane2">
							<p className="lt">
								<span>Save a statement</span>
								<b>12 ms</b>
							</p>
							<div className="track">
								<i data-ms={12} />
							</div>
						</div>
						<div className="lane2 budget">
							<p className="lt">
								<span>Time a natural spoken reply allows</span>
								<b>about {BUDGET} ms</b>
							</p>
							<div className="track">
								<i data-ms={BUDGET} />
							</div>
						</div>
						<div className="tune-h">
							<p>Bars play {SLOW} times slower than real time.</p>
							<button
								className="btn btn-ink btn-sm"
								type="button"
								onClick={race}
							>
								Race again
							</button>
						</div>
						<p className="src">
							Middle values on a 4-core server with no GPU and no paid AI
							service. Set it per request with <code>rerank</code> and{" "}
							<code>rerankPool</code>. Repeat it with{" "}
							<code>scripts/benchmark-locomo.ts</code>.
						</p>
					</div>
				</div>
			</div>
		</section>
	)
}
