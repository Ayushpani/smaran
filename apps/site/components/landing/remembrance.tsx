"use client"

import { useEffect, useRef, useState } from "react"
import { gsap, motionOn } from "@/lib/gsap"

const ASKS = [
	{ id: "en", tab: "English", lang: "en", q: "Where does the caller live?" },
	{ id: "hi", tab: "हिंदी", lang: "hi", q: "वह कहाँ रहती है?" },
	{ id: "hing", tab: "Hinglish", lang: "hi-Latn", q: "woh kahan rehti hai?" },
] as const

const RECALLED = [
	{
		text: "mera ghar Andheri West mein hai",
		when: "said in Hinglish, 21 Sept",
		lang: "hi-Latn",
	},
	{
		text: "We moved flats last month",
		when: "said in English, 2 Nov",
		lang: "en",
	},
]

export function Remembrance() {
	const giantRef = useRef<HTMLDivElement>(null)
	const qRef = useRef<HTMLParagraphElement>(null)
	const aRef = useRef<HTMLDivElement>(null)
	const [ask, setAsk] = useState(0)

	useEffect(() => {
		const g = giantRef.current
		if (!g || !motionOn()) return
		const ctx = gsap.context(() => {
			gsap.fromTo(
				g,
				{ "--fill": "0%" },
				{
					"--fill": "100%",
					ease: "none",
					scrollTrigger: {
						trigger: g,
						start: "top 85%",
						end: "bottom 35%",
						scrub: 0.6,
					},
				},
			)
			gsap.fromTo(
				g,
				{ xPercent: 6 },
				{
					xPercent: -6,
					ease: "none",
					scrollTrigger: {
						trigger: g,
						start: "top bottom",
						end: "bottom top",
						scrub: true,
					},
				},
			)
		})
		return () => ctx.revert()
	}, [])

	const pick = (k: number) => {
		if (k === ask) return
		setAsk(k)
		if (!motionOn()) return
		requestAnimationFrame(() => {
			if (qRef.current)
				gsap.fromTo(
					qRef.current,
					{ yPercent: 40, opacity: 0, filter: "blur(6px)" },
					{
						yPercent: 0,
						opacity: 1,
						filter: "blur(0px)",
						duration: 0.6,
						ease: "expo.out",
					},
				)
			if (aRef.current)
				gsap.fromTo(
					aRef.current.querySelectorAll(".line"),
					{ x: -14, opacity: 0.2 },
					{
						x: 0,
						opacity: 1,
						duration: 0.55,
						stagger: 0.08,
						delay: 0.25,
						ease: "power3.out",
					},
				)
		})
	}

	const a = ASKS[ask]!
	return (
		<section
			className="section smaran tone-hero"
			data-tone="hero"
			aria-labelledby="smaran-title"
		>
			<div className="wrap">
				<p className="kicker" id="smaran-title">
					Smaran{" "}
					<span className="deva" lang="hi">
						स्मरण
					</span>
				</p>
				<div className="giant" ref={giantRef} aria-hidden="true">
					<span className="outline" lang="hi">
						स्मरण
					</span>
					<span className="fill" lang="hi">
						स्मरण
					</span>
				</div>
				<div className="meaning">
					<p className="say">
						Hindi and Sanskrit for remembrance: calling something back to mind.{" "}
						<em>
							Built for callers who switch languages mid-sentence, and who
							expect to be remembered either way.
						</em>
					</p>
					<div className="lang-demo">
						<fieldset className="lang-tabs">
							<legend className="vh">Ask in</legend>
							{ASKS.map((x, k) => (
								<button
									key={x.id}
									type="button"
									aria-pressed={k === ask}
									lang={x.lang}
									onClick={() => pick(k)}
								>
									{x.tab}
								</button>
							))}
						</fieldset>
						<p className="lang-q" ref={qRef} aria-live="polite">
							<span className="lbl">Your agent asks</span>
							<span lang={a.lang}>{a.q}</span>
						</p>
						<div className="lang-a" ref={aRef}>
							<span className="lbl">Smaran recalls the same memories</span>
							{RECALLED.map((r) => (
								<p className="line" key={r.text}>
									<span lang={r.lang}>{r.text}</span>
									<span>{r.when}</span>
								</p>
							))}
						</div>
						<p className="lang-src">
							An illustration. Nothing is translated: one multilingual model
							places all three questions near the same memories. On a
							26-question English, Hindi and Hinglish test set, the right memory
							ranked first 20 times.
						</p>
					</div>
				</div>
			</div>
		</section>
	)
}
