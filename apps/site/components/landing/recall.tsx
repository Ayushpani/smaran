"use client"

import { useEffect, useRef, useState } from "react"
import { el, gsap, motionOn, ScrollTrigger } from "@/lib/gsap"
import { Reveal } from "./reveal"

interface Scenario {
	label: string
	query: string
	mem: Record<string, string>
	/** Rankings from the three channels, best first. */
	lanes: [string[], string[], string[]]
	/** Final order after reranking; null when reranking is skipped. */
	reranked: string[] | null
	note: string
}

const SCENARIOS: Scenario[] = [
	{
		label: "Where does she live?",
		query: "where does the caller live?",
		mem: {
			A: "I live in Andheri West",
			B: "My mother lives in Pune",
			C: "I work in Lower Parel",
			D: "We moved flats last month",
		},
		lanes: [["B", "A", "D", "C"], ["B"], ["A", "B", "C"]],
		reranked: ["A", "B", "C", "D"],
		note: "Fusion puts the mother first, because “lives” matches. The reranker reads the whole sentence and corrects it.",
	},
	{
		label: "What is she allergic to?",
		query: "what is she allergic to?",
		mem: {
			A: "I’m allergic to peanuts",
			B: "I’m allergic to penicillin",
			C: "Peanut butter is my son’s favourite",
			D: "I had a reaction last week",
		},
		lanes: [["A", "B", "D", "C"], ["A", "B"], ["C"]],
		reranked: ["A", "B", "D", "C"],
		note: "Both allergies come back on top. Smaran never kept only one of them.",
	},
	{
		label: "mera ghar kahan hai?",
		query: "mera ghar kahan hai?",
		mem: {
			A: "I live in Andheri West",
			B: "My mother lives in Pune",
			C: "I work in Lower Parel",
			D: "We moved flats last month",
		},
		lanes: [["A", "D", "B", "C"], [], []],
		reranked: null,
		note: "A Hinglish question. The English reranker is skipped and the multilingual fused order stands.",
	},
]

/** Reciprocal rank fusion with k = 60, exactly as the engine scores it. */
function fuse(lanes: string[][]) {
	const score: Record<string, number> = {}
	for (const lane of lanes)
		lane.forEach((id, r) => {
			score[id] = (score[id] ?? 0) + 1 / (61 + r)
		})
	const order = Object.keys(score).sort((a, b) => score[b]! - score[a]!)
	return { score, order }
}

const LANE_NAMES = ["By meaning", "By exact words", "By places and people"]

export function Recall() {
	const stageRef = useRef<HTMLDivElement>(null)
	const qRef = useRef<HTMLSpanElement>(null)
	const lineRef = useRef<HTMLParagraphElement>(null)
	const fusedRef = useRef<HTMLOListElement>(null)
	const fusedHRef = useRef<HTMLParagraphElement>(null)
	const laneRefs = useRef<(HTMLOListElement | null)[]>([])
	const [pick, setPick] = useState(0)
	const play = useRef<(k: number) => void>(() => {})

	useEffect(() => {
		const stage = stageRef.current
		const qEl = qRef.current
		const line = lineRef.current
		const fused = fusedRef.current
		const fusedH = fusedHRef.current
		if (!stage || !qEl || !line || !fused || !fusedH) return
		const motion = motionOn()
		let tl: gsap.core.Timeline | null = null

		const chip = (sc: Scenario, id: string, n: number, s?: string) => {
			const li = el("li", "r")
			li.dataset.id = id
			li.append(el("span", "n", String(n)), el("span", "t", sc.mem[id]))
			if (s != null) li.append(el("span", "s", s))
			return li
		}
		const lanes = () =>
			laneRefs.current.filter((x): x is HTMLOListElement => !!x)

		const still = (k: number) => {
			const sc = SCENARIOS[k]!
			const { score, order } = fuse(sc.lanes)
			qEl.textContent = sc.query
			lanes().forEach((ol, j) =>
				ol.replaceChildren(...sc.lanes[j]!.map((id, r) => chip(sc, id, r + 1))),
			)
			const final = sc.reranked ?? order
			fused.replaceChildren(
				...final.map((id, r) => {
					const was = order.indexOf(id) + 1
					return chip(
						sc,
						id,
						r + 1,
						sc.reranked
							? was === r + 1
								? "same"
								: `was ${was}`
							: score[id]!.toFixed(3),
					)
				}),
			)
			fused.firstElementChild?.classList.add("top")
			fusedH.textContent = sc.reranked ? "After reranking" : "Fused ranking"
			line.textContent = sc.note
		}

		const flip = (order: string[], fusedOrder: string[]) => {
			const items = [...fused.children] as HTMLElement[]
			const first = new Map(
				items.map((n) => [n.dataset.id, n.getBoundingClientRect()]),
			)
			order.forEach((id, r) => {
				const n = items.find((x) => x.dataset.id === id)
				if (!n) return
				const was = fusedOrder.indexOf(id) + 1
				const nEl = n.querySelector(".n")
				const sEl = n.querySelector(".s")
				if (nEl) nEl.textContent = String(r + 1)
				if (sEl) sEl.textContent = was === r + 1 ? "same" : `was ${was}`
				fused.append(n)
			})
			for (const n of items) {
				const a = first.get(n.dataset.id)
				const b = n.getBoundingClientRect()
				if (a)
					gsap.fromTo(
						n,
						{ y: a.top - b.top },
						{ y: 0, duration: 0.9, ease: "expo.inOut" },
					)
			}
		}

		const run = (k: number) => {
			if (!motion) {
				still(k)
				return
			}
			const sc = SCENARIOS[k]!
			const { score, order } = fuse(sc.lanes)
			tl?.kill()
			gsap.killTweensOf(stage.querySelectorAll("*"))
			for (const n of stage.querySelectorAll(".fly")) n.remove()
			for (const ol of lanes()) ol.replaceChildren()
			fused.replaceChildren()
			qEl.textContent = ""
			line.textContent = ""
			fusedH.textContent = "Fused ranking"
			tl = gsap.timeline()
			let t = 0.2
			for (let i = 1; i <= sc.query.length; i++) {
				tl.call(
					() => {
						qEl.textContent = sc.query.slice(0, i)
					},
					undefined,
					t,
				)
				t += 0.04
			}
			t += 0.35
			tl.call(
				() => {
					line.textContent = "Searching three ways at once"
				},
				undefined,
				t,
			)
			lanes().forEach((ol, j) => {
				sc.lanes[j]!.forEach((id, r) => {
					tl?.call(
						() => {
							const c = chip(sc, id, r + 1)
							ol.append(c)
							gsap.from(c, {
								y: -26,
								opacity: 0,
								duration: 0.55,
								ease: "back.out(1.8)",
							})
						},
						undefined,
						t + j * 0.12 + r * 0.16,
					)
				})
				if (!sc.lanes[j]!.length)
					tl?.call(
						() => {
							const li = el("li", "r", "No match")
							li.style.opacity = "0.45"
							ol.append(li)
						},
						undefined,
						t + j * 0.12,
					)
			})
			t += 1.4
			tl.call(
				() => {
					line.textContent =
						"Fusing: every list a memory appears in adds 1 / (60 + rank)"
				},
				undefined,
				t,
			)
			t += 0.7
			order.forEach((id, r) => {
				tl?.call(
					() => {
						const target = chip(sc, id, r + 1, score[id]!.toFixed(3))
						target.style.opacity = "0"
						fused.append(target)
						const sb = stage.getBoundingClientRect()
						const tb = target.getBoundingClientRect()
						const sources = [
							...stage.querySelectorAll<HTMLElement>(
								`.lane .r[data-id="${id}"]`,
							),
						]
						if (!sources.length) target.style.opacity = "1"
						sources.forEach((src, s) => {
							const b = src.getBoundingClientRect()
							const ghost = src.cloneNode(true) as HTMLElement
							ghost.classList.add("fly")
							Object.assign(ghost.style, {
								left: `${b.left - sb.left}px`,
								top: `${b.top - sb.top}px`,
								width: `${b.width}px`,
							})
							stage.append(ghost)
							gsap.to(src, { opacity: 0.25, duration: 0.3 })
							gsap.to(ghost, {
								left: tb.left - sb.left,
								top: tb.top - sb.top,
								width: tb.width,
								duration: 0.85,
								delay: s * 0.08,
								ease: "expo.inOut",
								onComplete: () => {
									ghost.remove()
									target.style.opacity = "1"
								},
							})
						})
					},
					undefined,
					t,
				)
				t += 0.55
			})
			t += 0.9
			if (sc.reranked) {
				const rr = sc.reranked
				tl.call(
					() => {
						line.textContent =
							"Reranking: a small model reads each candidate against the question"
						fusedH.textContent = "After reranking"
						flip(rr, order)
					},
					undefined,
					t,
				)
				t += 1.3
			}
			tl.call(
				() => {
					const top = fused.firstElementChild as HTMLElement | null
					top?.classList.add("top")
					if (top)
						gsap.from(top, { scale: 1.06, duration: 0.6, ease: "back.out(3)" })
					line.textContent = sc.note
				},
				undefined,
				t,
			)
		}
		play.current = run

		let st: ScrollTrigger | null = null
		if (motion)
			st = ScrollTrigger.create({
				trigger: stage,
				start: "top 75%",
				once: true,
				onEnter: () => run(0),
			})
		else still(0)
		return () => {
			st?.kill()
			tl?.kill()
		}
	}, [])

	return (
		<section
			className="section tone-deep"
			data-tone="deep"
			id="recall"
			aria-labelledby="recall-title"
		>
			<div className="wrap">
				<Reveal id="recall-title">Three ways to look. One answer.</Reveal>
				<p className="intro">
					Every question is searched by meaning, by exact words and by the
					places and people it mentions. The three rankings are fused, then a
					small model on your server reads the top 40 and puts the right one
					first. Pick a question.
				</p>
				<fieldset className="qpick">
					<legend className="vh">Question</legend>
					{SCENARIOS.map((s, k) => (
						<button
							key={s.label}
							type="button"
							aria-pressed={k === pick}
							onClick={() => {
								setPick(k)
								play.current(k)
							}}
						>
							{s.label}
						</button>
					))}
				</fieldset>
				<p className="query" aria-live="polite">
					<span className="label">Your agent asks</span>
					<span ref={qRef} />
					<span className="caret" />
				</p>
				<div className="rank-stage" ref={stageRef}>
					{LANE_NAMES.map((name, j) => (
						<div className="lane" key={name}>
							<p className="lane-h">{name}</p>
							<ol
								className="rlist"
								ref={(n) => {
									laneRefs.current[j] = n
								}}
							/>
						</div>
					))}
					<div className="fused">
						<p className="lane-h" ref={fusedHRef}>
							Fused ranking
						</p>
						<ol className="rlist" ref={fusedRef} />
					</div>
				</div>
				<div className="rank-foot">
					<p className="stepline" ref={lineRef} />
					<button
						className="btn btn-ghost btn-sm"
						type="button"
						onClick={() => play.current(pick)}
					>
						Play again
					</button>
				</div>
				<p className="fine-deep">
					An illustration, slowed down. The scores are the real fusion formula.
					Reranking runs on English questions over mostly English memories;
					newer memories win exact ties.
				</p>
			</div>
		</section>
	)
}
