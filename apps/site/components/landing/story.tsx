"use client"

import { useEffect, useRef, useState } from "react"
import { graphemes, gsap, motionOn, ScrollTrigger } from "@/lib/gsap"
import { Reveal } from "./reveal"

const CALLS = [
	{
		when: "3 Oct",
		quote: <>“My room number is 13.”</>,
		did: "New fact, stored.",
	},
	{
		when: "19 Oct",
		quote: <>“I’m allergic to peanuts.”</>,
		did: "New fact, stored.",
	},
	{
		when: "2 Nov",
		quote: (
			<>
				“I’m in room <s>930</s> sorry, 913 now.”
			</>
		),
		did: "Corrected mid-sentence. 13 is closed on 2 Nov, not deleted.",
	},
	{
		when: "14 Nov",
		quote: <>“I’m allergic to penicillin.”</>,
		did: "Added. A caller can be allergic to two things, so peanuts stays.",
	},
	{
		when: "20 Nov",
		quote: <>“Yes, still room 913.”</>,
		did: "Same fact again. No duplicate, more certain.",
	},
	{
		when: "Today",
		quote: <>Agent asks: what was her room on 10 Oct?</>,
		did: "Smaran answers from the history: 13.",
		ask: true,
	},
]

const NOTE = "Both kept. Neither replaces the other."
const H13: [string, string][] = [["13", "3 Oct to 2 Nov"]]
const STATES = [
	{
		room: "13",
		hist: [] as [string, string][],
		heard: 1,
		allergies: [] as string[],
		note: "",
		asked: false,
	},
	{
		room: "13",
		hist: [],
		heard: 1,
		allergies: ["Peanuts"],
		note: "",
		asked: false,
	},
	{
		room: "913",
		hist: H13,
		heard: 1,
		allergies: ["Peanuts"],
		note: "",
		asked: false,
	},
	{
		room: "913",
		hist: H13,
		heard: 1,
		allergies: ["Peanuts", "Penicillin"],
		note: NOTE,
		asked: false,
	},
	{
		room: "913",
		hist: H13,
		heard: 2,
		allergies: ["Peanuts", "Penicillin"],
		note: NOTE,
		asked: false,
	},
	{
		room: "913",
		hist: H13,
		heard: 2,
		allergies: ["Peanuts", "Penicillin"],
		note: NOTE,
		asked: true,
	},
]
const LAST = STATES.length - 1

export function Story() {
	const secRef = useRef<HTMLElement>(null)
	const roomRef = useRef<HTMLParagraphElement>(null)
	const histRef = useRef<HTMLUListElement>(null)
	const chipsRef = useRef<HTMLDivElement>(null)
	const heardRef = useRef<HTMLSpanElement>(null)
	const cardRef = useRef<HTMLDivElement>(null)
	const barRef = useRef<HTMLElement>(null)
	const [step, setStep] = useState(LAST)
	const prev = useRef(-1)

	const goTo = (k: number) => {
		const sec = secRef.current
		if (!sec || !motionOn()) return
		const top = sec.getBoundingClientRect().top + window.scrollY
		const span = sec.offsetHeight - window.innerHeight
		window.scrollTo({
			top: top + ((k + 0.5) / STATES.length) * span,
			behavior: "smooth",
		})
	}

	// Scroll drives the step.
	useEffect(() => {
		const sec = secRef.current
		if (!sec || !motionOn()) return
		setStep(0)
		const st = ScrollTrigger.create({
			trigger: sec,
			start: "top top",
			end: "bottom bottom",
			onUpdate: (self) => {
				if (barRef.current)
					barRef.current.style.transform = `scaleX(${self.progress})`
				setStep(Math.min(LAST, Math.floor(self.progress * STATES.length)))
			},
		})
		return () => st.kill()
	}, [])

	// The card tilts toward the pointer.
	useEffect(() => {
		const card = cardRef.current
		if (!card || !motionOn()) return
		const rx = gsap.quickTo(card, "rotationX", {
			duration: 0.6,
			ease: "power3",
		})
		const ry = gsap.quickTo(card, "rotationY", {
			duration: 0.6,
			ease: "power3",
		})
		gsap.set(card, { transformPerspective: 900 })
		const move = (e: PointerEvent) => {
			const r = card.getBoundingClientRect()
			ry(((e.clientX - r.left) / r.width - 0.5) * 10)
			rx(-((e.clientY - r.top) / r.height - 0.5) * 10)
		}
		const leave = () => {
			rx(0)
			ry(0)
		}
		card.addEventListener("pointermove", move)
		card.addEventListener("pointerleave", leave)
		return () => {
			card.removeEventListener("pointermove", move)
			card.removeEventListener("pointerleave", leave)
		}
	}, [])

	// Animate the card's fields between steps.
	useEffect(() => {
		const room = roomRef.current
		const hist = histRef.current
		const chips = chipsRef.current
		const heard = heardRef.current
		if (!room || !hist || !chips || !heard) return
		const k = step
		const p = STATES[prev.current]
		const s = STATES[k]!
		const fwd = k > prev.current
		const anim = motionOn() && !!p && fwd
		if (!p || p.room !== s.room) {
			const fresh = graphemes(s.room).map((d) => {
				const n = document.createElement("span")
				n.className = "d"
				n.textContent = d
				return n
			})
			const old = [...room.querySelectorAll(".d")]
			gsap.killTweensOf(old)
			if (motionOn() && p) {
				const dir = fwd ? 1 : -1
				gsap.to(old, {
					yPercent: 90 * dir,
					opacity: 0,
					duration: 0.28,
					stagger: 0.04,
					ease: "power2.in",
					onComplete: () => {
						room.replaceChildren(...fresh)
						gsap.from(fresh, {
							yPercent: -90 * dir,
							opacity: 0,
							duration: 0.6,
							stagger: 0.07,
							ease: "back.out(2)",
						})
					},
				})
			} else room.replaceChildren(...fresh)
		}
		if (anim && !p.hist.length && s.hist.length && hist.firstElementChild)
			gsap.from(hist.firstElementChild, {
				y: -46,
				opacity: 0,
				duration: 0.8,
				delay: 0.2,
				ease: "expo.out",
			})
		if (anim && s.asked && hist.firstElementChild)
			gsap.from(hist.firstElementChild, {
				scale: 0.9,
				duration: 0.55,
				ease: "back.out(3)",
				transformOrigin: "left center",
			})
		if (anim && s.heard > p.heard)
			gsap.from(heard.children[s.heard - 1] ?? [], {
				scaleX: 0,
				transformOrigin: "left",
				duration: 0.5,
				ease: "expo.out",
			})
		if (anim)
			[...chips.children].forEach((c, i) => {
				if (!p.allergies.includes(s.allergies[i] ?? ""))
					gsap.from(c, {
						scale: 0.4,
						opacity: 0,
						y: -24,
						duration: 0.7,
						ease: "back.out(2.2)",
					})
			})
		prev.current = k
	}, [step])

	const s = STATES[step]!
	return (
		<section
			className="story tone-paper"
			data-tone="paper"
			id="story"
			ref={secRef}
			aria-labelledby="story-title"
		>
			<div className="story-pin">
				<div className="wrap story-grid">
					<div>
						<Reveal id="story-title">One caller. Six weeks.</Reveal>
						<p className="intro">
							Keep scrolling, or pick a call. Each one changes what your agent
							knows about her.
						</p>
						<ol className="calls">
							{CALLS.map((c, i) => (
								<li key={c.when}>
									<button
										type="button"
										className={`call${c.ask ? " ask" : ""}${i === step ? " now" : ""}${i < step ? " past" : ""}`}
										onClick={() => goTo(i)}
									>
										<span className="when">{c.when}</span>
										<span className="quote">{c.quote}</span>
										<span className="did">{c.did}</span>
									</button>
								</li>
							))}
						</ol>
					</div>
					<div className="profile" ref={cardRef} aria-live="polite">
						<p className="p-title">What your agent knows</p>
						<p className="p-name">Priya, caller 98201</p>
						<div className="field">
							<p className="f-label">
								<span>Room number</span>
								<span
									className="heard"
									ref={heardRef}
									role="img"
									aria-label={`Heard on ${s.heard} call${s.heard > 1 ? "s" : ""}`}
								>
									{[0, 1, 2].map((i) => (
										<i key={i} className={i < s.heard ? "on" : ""} />
									))}
								</span>
							</p>
							<p className="vh">Room {s.room}</p>
							<p className="f-val" ref={roomRef} aria-hidden="true" />
							<ul className="hist" ref={histRef}>
								{s.hist.map(([v, when]) => (
									<li key={v} className={s.asked ? "asked" : ""}>
										<s>{v}</s> {when}
										{s.asked && <span className="tag">Answer for 10 Oct</span>}
									</li>
								))}
							</ul>
						</div>
						<div className="field">
							<p className="f-label">
								<span>Allergies</span>
							</p>
							<div className="chips" ref={chipsRef}>
								{s.allergies.map((a) => (
									<span key={a} className="chip">
										{a}
									</span>
								))}
							</div>
							<p className="p-note">{s.note}</p>
						</div>
					</div>
				</div>
				<div className="progress" aria-hidden="true">
					<i ref={barRef} />
				</div>
			</div>
		</section>
	)
}
