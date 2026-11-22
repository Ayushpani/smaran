"use client"

import { useEffect, useRef } from "react"

export default function Landing() {
	const rootRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		document.documentElement.classList.add("js")
		const RM = matchMedia("(prefers-reduced-motion: reduce)").matches
		const FINE = matchMedia("(pointer: fine)").matches
		if (FINE) document.documentElement.classList.add("fine")
		if (RM) document.documentElement.classList.add("rm")

		const $ = <T extends Element = Element>(s: string): T | null =>
			document.querySelector(s)
		const $$ = <T extends Element = Element>(s: string): T[] =>
			Array.from(document.querySelectorAll(s))
		const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))

		const M = { x: innerWidth / 2, y: innerHeight * 0.4, spd: 0 }
		const onMove = (e: MouseEvent) => {
			const d = Math.hypot(e.clientX - M.x, e.clientY - M.y)
			M.spd = M.spd * 0.85 + d * 0.15
			M.x = e.clientX
			M.y = e.clientY
		}
		addEventListener("mousemove", onMove, { passive: true })

		// cursor hover labels
		const cDot = $<HTMLElement>("#cDot")
		const cRing = $<HTMLElement>("#cRing")
		const cLbl = $<HTMLElement>("#cLbl")
		let rx = M.x
		let ry = M.y
		$$<HTMLElement>("[data-hover]").forEach((el) => {
			el.addEventListener("mouseenter", () => {
				cDot?.classList.add("hov")
				cRing?.classList.add("hov")
				const l = el.getAttribute("data-label")
				if (l && cLbl) {
					cLbl.textContent = l
					cRing?.classList.add("lbl")
				}
			})
			el.addEventListener("mouseleave", () => {
				cDot?.classList.remove("hov")
				cRing?.classList.remove("hov")
				cRing?.classList.remove("lbl")
			})
		})

		// reveals
		$$<HTMLElement>(".rv").forEach((el) => {
			const d = el.getAttribute("data-d")
			if (d) el.style.transitionDelay = d
		})
		const io = new IntersectionObserver(
			(es) => {
				for (const e of es)
					if (e.isIntersecting) {
						e.target.classList.add("in")
						io.unobserve(e.target)
					}
			},
			{ threshold: 0.12, rootMargin: "0px 0px -50px 0px" },
		)
		$$(".rv").forEach((el) => io.observe(el))

		// counters
		const cio = new IntersectionObserver(
			(es) => {
				for (const e of es) {
					if (!e.isIntersecting) continue
					cio.unobserve(e.target)
					const el = e.target as HTMLElement
					const target = Number.parseFloat(el.dataset.count || "0")
					const dec = Number.parseInt(el.dataset.dec || "0", 10)
					const t0 = performance.now()
					const tick = (t: number) => {
						const p = clamp((t - t0) / 1400)
						const v = target * (1 - 2 ** (-10 * p))
						el.textContent = v.toFixed(dec)
						if (p < 1) requestAnimationFrame(tick)
						else el.textContent = target.toFixed(dec)
					}
					requestAnimationFrame(tick)
				}
			},
			{ threshold: 0.5 },
		)
		$$("[data-count]").forEach((el) => cio.observe(el))

		// hero intro
		const hero = $<HTMLElement>("#hero")
		const scribP = $<SVGPathElement>("#scribP")
		if (scribP) {
			const len = Math.ceil(scribP.getTotalLength() + 4)
			scribP.style.strokeDasharray = String(len)
			scribP.style.strokeDashoffset = String(len)
		}
		const heroIn = () => hero?.classList.add("in")
		if (RM) heroIn()
		else {
			const go = () => setTimeout(heroIn, 100)
			if ((document as any).fonts?.ready) (document as any).fonts.ready.then(go)
			else go()
		}

		// budget bars
		const bz = $<HTMLElement>("#bz")
		if (bz) {
			const bzIO = new IntersectionObserver(
				(es) => {
					for (const e of es) {
						if (!e.isIntersecting) continue
						bzIO.unobserve(bz)
						setTimeout(() => $("#bzLose")?.classList.add("go"), 150)
						setTimeout(() => $("#bzWin")?.classList.add("go"), 650)
					}
				},
				{ threshold: 0.35 },
			)
			bzIO.observe(bz)
		}

		// nav
		const nav = $<HTMLElement>("#nav")
		let lastY = scrollY
		let vel = 0

		// rail
		const railFill = $<HTMLElement>("#railFill")
		const recTime = $<HTMLElement>("#recTime")
		const railDots = $$<HTMLButtonElement>(".rail-dot")
		const railLab = $<HTMLElement>("#railLab")
		const sections = [
			"#hero",
			"#problem",
			"#story",
			"#caps",
			"#samples",
			"#code",
		]
			.map((s) => $<HTMLElement>(s))
			.filter(Boolean) as HTMLElement[]
		let activeIdx = 0
		const setDot = (i: number) => {
			if (i === activeIdx) return
			activeIdx = i
			railDots.forEach((d, j) => d.classList.toggle("on", j === i))
			if (railLab && railDots[i]) {
				railLab.textContent = railDots[i].getAttribute("data-l") || ""
				railLab.style.top = railDots[i].style.top
			}
		}
		railDots.forEach((d) => {
			d.addEventListener("click", () => {
				const sel = d.getAttribute("data-t")
				if (sel) $(sel)?.scrollIntoView({ behavior: RM ? "auto" : "smooth" })
			})
		})
		const secIO = new IntersectionObserver(
			(es) => {
				for (const e of es) {
					if (!e.isIntersecting) continue
					const idx = sections.indexOf(e.target as HTMLElement)
					if (idx > -1) setDot(idx)
				}
			},
			{ rootMargin: "-30% 0px -50% 0px" },
		)
		sections.forEach((s) => secIO.observe(s))
		setDot(0)

		// story scrub
		const story = $<HTMLElement>("#story")
		const stWords = $$<HTMLElement>("#stT .stw")
		const stCard = $<HTMLElement>("#stCard")
		const stWave = $<HTMLElement>("#stWave")
		const stPhs = $$<HTMLElement>("#stRail .st-ph")
		const stBars: HTMLElement[] = []
		if (stWave) {
			for (let bi = 0; bi < 30; bi++) {
				const b = document.createElement("i")
				stWave.appendChild(b)
				stBars.push(b)
			}
		}
		let storyLive = false
		if (story)
			new IntersectionObserver(
				(es) => {
					for (const e of es) storyLive = e.isIntersecting
				},
				{ threshold: 0 },
			).observe(story)

		const storyScrub = () => {
			if (!storyLive || !story) return
			const total = story.offsetHeight - innerHeight
			if (total <= 0) return
			const p = clamp(-story.getBoundingClientRect().top / total)
			// New pacing — whole line fades in as ONE motion (no per-word
			// cascade that read as "letters being cut"), then the strike and
			// correction fire in one clean gesture.
			const lineIn = clamp((p - 0.05) / 0.15)
			stWords.forEach((w) => {
				const k = w.getAttribute("data-k")
				if (k === "say" || k === "ret") {
					w.style.opacity = String(lineIn)
					w.style.transform = `translateY(${(1 - lineIn) * 0.4}em)`
					if (k === "ret") {
						const stk = w.querySelector<HTMLElement>(".stk")
						if (stk) stk.style.transform = `scaleX(${clamp((p - 0.3) / 0.08)})`
					}
				} else if (k === "cue") {
					const c = clamp((p - 0.36) / 0.05)
					w.style.opacity = String(c)
					w.style.transform = `translateY(${(1 - c) * 0.4}em)`
				} else if (k === "fix") {
					const f = clamp((p - 0.42) / 0.06)
					w.style.opacity = String(f)
					w.style.transform = `scale(${0.9 + f * 0.1}) translateY(${(1 - f) * 0.3}em)`
				}
			})
			const cd = clamp((p - 0.52) / 0.08)
			if (stCard) {
				stCard.style.opacity = String(cd)
				stCard.style.transform = `translateY(${(1 - cd) * 30}px)`
			}
			stWave?.classList.toggle("show", p > 0.05 && p < 0.98)
			const ph = p < 0.28 ? 0 : p < 0.36 ? 1 : p < 0.48 ? 2 : 3
			stPhs.forEach((el) =>
				el.classList.toggle("on", Number(el.getAttribute("data-p")) === ph),
			)
		}

		// def parallax
		const def = $<HTMLElement>(".def")
		const defBig = $<HTMLElement>("#defBig")
		let defLive = false
		if (def)
			new IntersectionObserver(
				(es) => {
					for (const e of es) defLive = e.isIntersecting
				},
				{ threshold: 0 },
			).observe(def)
		const defScrub = () => {
			if (!defLive || RM || !def || !defBig) return
			const r = def.getBoundingClientRect()
			const pp = clamp((innerHeight - r.top) / (innerHeight + r.height))
			defBig.style.transform = `translate(-50%,-50%) translateX(${(0.5 - pp) * 34}%) rotate(${(0.5 - pp) * 3}deg)`
		}

		// stack cards
		const stackCards = $$<HTMLElement>("#stack .stkc")
		const stackScrub = () => {
			for (let i = 0; i < stackCards.length; i++) {
				const next = stackCards[i + 1]
				if (!next) {
					stackCards[i].classList.remove("under")
					continue
				}
				const nt = next.getBoundingClientRect().top
				const stick = 96 + i * 22
				stackCards[i].classList.toggle("under", nt < innerHeight * 0.16 + stick)
			}
		}

		// tape scrub
		const tape = $<HTMLElement>("#samples")
		const tTrack = $<HTMLElement>("#tTrack")
		const tpIdx = $<HTMLElement>("#tpIdx")
		const tpFill = $<HTMLElement>("#tpFill")
		let tapeLive = false
		if (tape)
			new IntersectionObserver(
				(es) => {
					for (const e of es) tapeLive = e.isIntersecting
				},
				{ threshold: 0 },
			).observe(tape)
		const tapeScrub = () => {
			if (innerWidth <= 860 || !tapeLive || !tape || !tTrack) return
			const total = tape.offsetHeight - innerHeight
			if (total <= 0) return
			const p = clamp(-tape.getBoundingClientRect().top / total)
			const max = Math.max(0, tTrack.scrollWidth - innerWidth + 80)
			tTrack.style.transform = `translateX(${-p * max}px)`
			if (tpFill) tpFill.style.width = `${p * 100}%`
			if (tpIdx)
				tpIdx.textContent = ("0" + Math.max(1, Math.round(1 + p * 5))).slice(-2)
		}

		// scroll master
		const onScroll = () => {
			const y = scrollY
			const max = document.documentElement.scrollHeight - innerHeight
			const pr = max > 0 ? y / max : 0
			if (railFill) railFill.style.transform = `scaleY(${pr})`
			const secs = pr * 61
			const mm = ("0" + Math.floor(secs / 60)).slice(-2)
			const ss = ("0" + Math.floor(secs % 60)).slice(-2)
			const ff = ("0" + Math.floor((secs % 1) * 24)).slice(-2)
			if (recTime) recTime.textContent = `${mm}:${ss}:${ff}`
			vel = y - lastY
			lastY = y
			nav?.classList.toggle("shadow", y > 40)
			if (y > 300 && vel > 3) nav?.classList.add("hide")
			else if (vel < -3 || y < 300) nav?.classList.remove("hide")
			storyScrub()
			defScrub()
			stackScrub()
			tapeScrub()
		}
		addEventListener("scroll", onScroll, { passive: true })

		// wave canvas
		const cv = $<HTMLCanvasElement>("#ctaWave")
		const ctx = cv?.getContext("2d") || null
		let cvW = 0
		let cvH = 76
		let n = 0
		let cvTop = 0
		const resizeCv = () => {
			if (!cv) return
			const dpr = Math.min(devicePixelRatio || 1, 2)
			cvW = cv.clientWidth || (cv.parentElement?.clientWidth ?? 0)
			cvH = cv.clientHeight || 76
			cv.width = cvW * dpr
			cv.height = cvH * dpr
			ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
			n = Math.ceil(cvW / 8)
		}
		const measureCv = () => {
			if (cv) cvTop = cv.getBoundingClientRect().top + scrollY
		}
		resizeCv()
		measureCv()
		addEventListener("resize", () => {
			resizeCv()
			setTimeout(measureCv, 100)
		})
		setTimeout(measureCv, 400)
		const drawWave = (t: number) => {
			if (!ctx) return
			ctx.clearRect(0, 0, cvW, cvH)
			const inBand = M.y > cvTop - scrollY && M.y < cvTop - scrollY + cvH
			const pulse = RM ? -9999 : ((t * 0.05) % (cvW + 200)) - 100
			const mid = cvH * 0.55
			for (let i = 0; i < n; i++) {
				const x = i * 8 + 2
				const idle =
					3 +
					(Math.sin(t * 0.0016 + i * 0.42) + 1) * 1.6 +
					(Math.sin(t * 0.0009 + i * 0.13 + 1.7) + 1) * 1.4
				let amp = 0
				if (inBand) {
					const d = x - M.x
					amp +=
						Math.exp(-(d * d) / (2 * 85 * 85)) *
						(8 + Math.min(M.spd * 0.55, 46))
				}
				const pd = x - pulse
				amp += Math.exp(-(pd * pd) / (2 * 60 * 60)) * 13
				const bh = Math.min(idle + amp, cvH * 0.85)
				const en = clamp(amp / 26)
				const a = 0.15 + en * 0.7
				ctx.fillStyle =
					en > 0.28 ? `rgba(61,139,255,${a})` : `rgba(226,229,228,${a * 0.7})`
				const yPos = mid - bh / 2
				ctx.fillRect(x, yPos, 3.5, bh)
			}
		}

		// marquee
		const mqTrack = $<HTMLElement>("#mqTrack")
		const mqSet = $<HTMLElement>("#mqSet")
		if (mqTrack && mqSet) mqTrack.appendChild(mqSet.cloneNode(true))
		let mqX = 0
		let mqW = 0
		const measureMq = () => {
			if (mqSet) mqW = mqSet.offsetWidth
		}
		if ((document as any).fonts?.ready)
			(document as any).fonts.ready.then(measureMq)
		measureMq()
		addEventListener("resize", measureMq)
		const mqTick = (velS: number) => {
			if (RM || !mqW || !mqTrack) return
			mqX -= 0.6 + Math.min(Math.abs(velS) * 0.05, 5)
			if (mqX <= -mqW) mqX += mqW
			mqTrack.style.transform = `translateX(${mqX}px)`
		}

		// hero parallax
		const heroGhost = $<HTMLElement>("#heroGhost")
		const heroH1 = $<HTMLElement>("#heroH1")
		let gx = 0
		let gy = 0
		const heroParallax = () => {
			if (!FINE || RM) return
			const nx = M.x / innerWidth - 0.5
			const ny = M.y / innerHeight - 0.5
			gx += (nx - gx) * 0.05
			gy += (ny - gy) * 0.05
			if (heroGhost)
				heroGhost.style.transform = `translate(${gx * -26}px,${gy * -18}px)`
			if (heroH1) heroH1.style.transform = `translate(${gx * 10}px,${gy * 8}px)`
		}

		// magnet buttons
		if (FINE && !RM) {
			$$<HTMLElement>(".magnet").forEach((el) => {
				el.addEventListener("mousemove", (e) => {
					const r = el.getBoundingClientRect()
					const ev = e as MouseEvent
					el.style.transform = `translate(${(ev.clientX - r.left - r.width / 2) * 0.2}px,${(ev.clientY - r.top - r.height / 2) * 0.28}px)`
				})
				el.addEventListener("mouseleave", () => {
					el.style.transform = ""
				})
			})
		}

		// code tabs
		const crFile = $<HTMLElement>("#crFile")
		const FILENAMES: Record<string, string> = {
			"p-livekit": "adapter-livekit.ts",
			"p-vapi": "adapter-vapi.ts",
			"p-claude": "adapter-anthropic.ts",
			"p-openai": "adapter-openai.ts",
		}
		$$<HTMLButtonElement>("#vtabs .vtab").forEach((b) => {
			b.addEventListener("click", () => {
				$$(".vtab").forEach((x) => x.classList.remove("on"))
				$$(".cpanel").forEach((x) => x.classList.remove("on"))
				b.classList.add("on")
				const id = b.getAttribute("data-p") || ""
				$(`#${id}`)?.classList.add("on")
				if (crFile) crFile.textContent = FILENAMES[id] || ""
			})
		})

		// toast + copy
		const toast = $<HTMLElement>("#toast")
		let toastT: ReturnType<typeof setTimeout>
		const showToast = (msg: string) => {
			if (!toast) return
			toast.textContent = msg
			toast.classList.add("show")
			clearTimeout(toastT)
			toastT = setTimeout(() => toast.classList.remove("show"), 2000)
		}
		$("#copyBtn")?.addEventListener("click", () => {
			const txt = $(".cpanel.on pre")?.textContent || ""
			navigator.clipboard
				.writeText(txt)
				.then(() => showToast("Snippet copied — paste it into your agent"))
				.catch(() => showToast("Copy blocked by browser"))
		})
		$("#npmBtn")?.addEventListener("click", () => {
			navigator.clipboard
				.writeText(
					"git clone https://github.com/Ayushpani/smaran && cd smaran && bun install && bun run try",
				)
				.then(() => showToast("Run it locally — copied"))
				.catch(() => showToast("Copy blocked by browser"))
		})

		// master loop
		let velS = 0
		let rafId = 0
		const loop = (t: number) => {
			rx = rx + (M.x - rx) * 0.16
			ry = ry + (M.y - ry) * 0.16
			if (cDot)
				cDot.style.transform = `translate(${M.x}px,${M.y}px) translate(-50%,-50%)`
			if (cRing)
				cRing.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`
			M.spd *= 0.94
			velS += (vel - velS) * 0.1
			vel *= 0.6

			if (!RM) {
				mqTick(velS)
				heroParallax()
				drawWave(t)
				if (storyLive) {
					const now = t * 0.004
					for (let bi2 = 0; bi2 < stBars.length; bi2++) {
						const bh2 =
							7 +
							Math.abs(Math.sin(now + bi2 * 0.55)) * 20 +
							Math.abs(Math.cos(now * 0.7 + bi2 * 0.3)) * 7
						stBars[bi2].style.height = bh2.toFixed(1) + "px"
					}
				}
			}
			rafId = requestAnimationFrame(loop)
		}
		rafId = requestAnimationFrame(loop)
		onScroll()

		return () => {
			cancelAnimationFrame(rafId)
			removeEventListener("scroll", onScroll)
			removeEventListener("mousemove", onMove)
		}
	}, [])

	return (
		<div ref={rootRef}>
			<div className="grain" />
			<div className="cur-dot" id="cDot" />
			<div className="cur-ring" id="cRing">
				<span id="cLbl" />
			</div>
			<div id="toast" />

			<aside className="rail" aria-hidden>
				<div className="rail-track" id="railTrack">
					<div className="rail-fill" id="railFill" />
					<button
						className="rail-dot"
						style={{ top: "2%" }}
						data-t="#hero"
						data-l="start"
					/>
					<button
						className="rail-dot"
						style={{ top: "22%" }}
						data-t="#problem"
						data-l="the 500ms problem"
					/>
					<button
						className="rail-dot"
						style={{ top: "42%" }}
						data-t="#story"
						data-l="live demo"
					/>
					<button
						className="rail-dot"
						style={{ top: "60%" }}
						data-t="#caps"
						data-l="capabilities"
					/>
					<button
						className="rail-dot"
						style={{ top: "78%" }}
						data-t="#samples"
						data-l="the tape"
					/>
					<button
						className="rail-dot"
						style={{ top: "94%" }}
						data-t="#code"
						data-l="adapters"
					/>
				</div>
				<span className="rail-lab" id="railLab" />
			</aside>
			<div className="rec">
				<i />
				REC <span id="recTime">00:00:00</span>
			</div>

			<nav className="nav" id="nav">
				<a href="#hero" className="brand">
					Smaran <i>स्मरण</i>
				</a>
				<ul className="nlinks">
					<li>
						<a href="#problem" className="nlink">
							Problem
						</a>
					</li>
					<li>
						<a href="#story" className="nlink">
							Demo
						</a>
					</li>
					<li>
						<a href="#caps" className="nlink">
							Capabilities
						</a>
					</li>
					<li>
						<a href="#code" className="nlink">
							Adapters
						</a>
					</li>
					<li>
						<a href="/docs" className="nlink">
							Docs
						</a>
					</li>
				</ul>
				<a
					href="https://github.com/Ayushpani/smaran"
					target="_blank"
					rel="noopener"
					className="ncta"
					data-hover
					data-label="REPO"
				>
					GitHub →
				</a>
			</nav>

			{/* HERO */}
			<header className="hero" id="hero">
				<div className="hero-ghost" id="heroGhost">
					स्मरण
				</div>
				<div className="wrap hero-grid">
					<div>
						<div className="hero-kicker rv">
							<span className="kick-rule" />
							<b>Smaran</b>· voice-native memory · Hindi + English
						</div>
						<h1 id="heroH1">
							<span className="hline">
								<span className="hw" style={{ ["--d" as any]: ".05s" }}>
									Said
								</span>{" "}
								<span className="hw" style={{ ["--d" as any]: ".14s" }}>
									once,
								</span>
							</span>
							<span className="hline">
								<span className="hw" style={{ ["--d" as any]: ".23s" }}>
									remembered
								</span>
							</span>
							<span className="hline">
								<span className="hw emw" style={{ ["--d" as any]: ".34s" }}>
									<em>always.</em>
									<svg
										className="scrib"
										viewBox="0 0 320 100"
										preserveAspectRatio="none"
									>
										<path
											id="scribP"
											d="M10 62 C 58 16, 244 8, 294 40 C 320 60, 176 94, 66 84 C 16 79, 12 56, 82 44"
										/>
									</svg>
								</span>
							</span>
						</h1>
						<p className="hero-sub rv" data-d=".45s">
							Smaran hears the way people actually talk — the stumbles, the
							take-backs, the Hinglish — commits only what&apos;s true, and
							recalls it in <b>2.6&nbsp;ms</b>.
						</p>
						<div className="hero-btns rv" data-d=".55s">
							<a href="#story" className="btn btn-dark magnet" data-hover>
								<span className="btn-label">Hear it work</span>
								<span className="btn-arrow" aria-hidden="true">
									<svg viewBox="0 0 14 14" fill="none">
										<path
											d="M3 11L11 3M11 3H5M11 3V9"
											stroke="#fff"
											strokeWidth="1.4"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</span>
							</a>
							<a
								href="https://github.com/Ayushpani/smaran"
								target="_blank"
								rel="noopener"
								className="btn btn-line magnet"
								data-hover
								data-label="REPO"
							>
								GitHub
							</a>
						</div>
					</div>
				</div>

				<div className="strip">
					<div className="wrap strip-in">
						<span className="stamp">Sandbox benchmark</span>
						<div className="stat">
							<b>Save p50</b>
							<strong>
								<span data-count="10.7" data-dec="1">
									0
								</span>
								<u>ms</u>
							</strong>
						</div>
						<div className="stat g">
							<b>Recall p50</b>
							<strong>
								<span data-count="2.6" data-dec="1">
									0
								</span>
								<u>ms</u>
							</strong>
						</div>
						<div className="stat" style={{ borderRight: 0 }}>
							<b>whisper-tiny → smaran</b>
							<strong
								style={{
									fontFamily: "var(--mono)",
									fontSize: "12px",
									color: "var(--mut)",
									fontWeight: 400,
								}}
							>
								reproducible — see RESULTS.md
							</strong>
						</div>
					</div>
				</div>

				<div className="mq" aria-hidden>
					<div className="mq-track" id="mqTrack">
						<div className="mq-set" id="mqSet">
							{[
								"Vapi",
								"LiveKit",
								"Pipecat",
								"Retell",
								"Claude",
								"GPT Realtime",
								"Gemini Live",
								"Bland",
								"Codex",
							].map((name) => (
								<span
									key={name}
									style={{ display: "inline-flex", alignItems: "center" }}
								>
									<span className="mq-item">{name}</span>
									<svg className="mq-sep" viewBox="0 0 22 14">
										<path d="M1 7h2M6 3v8M11 1v12M16 4v6M21 7h1" />
									</svg>
								</span>
							))}
						</div>
					</div>
				</div>
			</header>

			{/* 500ms problem */}
			<section className="problem" id="problem">
				<div className="wrap">
					<div className="prob-head">
						<div className="rv">
							<div className="eyebrow">01 — The 500ms problem</div>
							<h2 className="big">
								Classic RAG breaks on a <em>live call.</em>
							</h2>
						</div>
						<p className="rv" data-d=".12s">
							Natural turn-taking needs a full roundtrip under 500ms.
							Traditional stacks spend most of it just finding what to remember.
						</p>
					</div>
					<div className="bz rv" data-d=".15s" id="bz">
						<div className="bz-row lose" id="bzLose">
							<div className="bz-name">
								<span>typical voice stack — retrieval alone</span>
								<span className="tot">480ms</span>
							</div>
							<div className="bz-track">
								<div className="bz-seg s1" style={{ width: "21.3%" }}>
									ASR<b>160</b>
								</div>
								<div className="bz-seg s2" style={{ width: "18.7%" }}>
									pipeline<b>140</b>
								</div>
								<div className="bz-seg s3" style={{ width: "26.7%" }}>
									vector RAG<b>180</b>
								</div>
								<div className="bz-over">
									→ + LLM + TTS · the caller hears 1.5s of silence
								</div>
								<div className="bz-mark">
									<i />
								</div>
							</div>
						</div>
						<div className="bz-row win" id="bzWin">
							<div className="bz-name">
								<span>
									smaran voice layer — full recall, reranked, injected
								</span>
								<span className="tot">140ms</span>
							</div>
							<div className="bz-track">
								<div
									className="bz-seg head"
									style={{
										width: "29.2%",
										minWidth: 8,
										background: "var(--moss)",
									}}
								/>
								<div className="room">
									340ms of headroom → natural conversation
								</div>
								<div className="bz-mark">
									<i />
								</div>
							</div>
							<div className="bz-cap">
								LoCoMo benchmark p50 with reranking, RESULTS.md · free CPU
								models, no network hop · micro-context &lt;150 tokens
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* story scrub */}
			<section className="story" id="story">
				<div className="story-st">
					<div className="st-cap">
						<i />A real speech turn, replayed at scroll speed
					</div>
					<div className="st-t" id="stT">
						<span className="stw" data-k="say">
							&ldquo;confirm
						</span>{" "}
						<span className="stw" data-k="say">
							my
						</span>{" "}
						<span className="stw" data-k="say">
							order
						</span>{" "}
						<span className="stw" data-k="say">
							—
						</span>{" "}
						<span className="stw" data-k="ret">
							<i className="stk" />
							one
						</span>{" "}
						<span className="stw" data-k="ret">
							<i className="stk" />
							two
						</span>{" "}
						<span className="stw" data-k="ret">
							<i className="stk" />
							three four,
						</span>{" "}
						<span className="stw cue" data-k="cue">
							actually
						</span>{" "}
						<span className="stw fix" data-k="fix">
							four three two one
						</span>
						<span className="stw" data-k="say">
							&rdquo;
						</span>
					</div>
					<div id="stWave" aria-hidden />
					<div className="st-card" id="stCard">
						<div className="g">
							<span className="k">Committed</span>
							<span className="v vm">order.id = #4321</span>
						</div>
						<div className="g">
							<span className="k">Discarded</span>
							<span className="v cut">&ldquo;#1234&rdquo;</span>
						</div>
						<div className="g">
							<span className="k">Save</span>
							<span className="v">13ms</span>
						</div>
						<div className="g">
							<span className="k">Recall</span>
							<span className="v vg">140ms</span>
						</div>
					</div>
					<div className="st-rail" id="stRail">
						<span className="st-ph" data-p="0">
							<i />
							Hear
						</span>
						<span className="st-dash" />
						<span className="st-ph" data-p="1">
							<i />
							Stumble
						</span>
						<span className="st-dash" />
						<span className="st-ph" data-p="2">
							<i />
							Correct
						</span>
						<span className="st-dash" />
						<span className="st-ph" data-p="3">
							<i />
							Remember
						</span>
					</div>
				</div>
			</section>

			{/* definition */}
			<section className="def">
				<div className="def-big" id="defBig">
					स्मरण
				</div>
				<div className="def-entry">
					<div className="def-w rv">
						<b>smaran</b>
						<i>स्मरण</i>
						<span>/ sməˈrʌn / · noun · Sanskrit</span>
					</div>
					<div className="def-rule rv" data-d=".08s" />
					<p className="def-l rv" data-d=".16s">
						<b>1.</b>the act of remembering; remembrance.
					</p>
					<p className="def-l rv" data-d=".26s" style={{ marginTop: 8 }}>
						<b>2.</b>what remains when the speaking stops.
					</p>
				</div>
			</section>

			{/* capabilities */}
			<section className="caps" id="caps">
				<div className="wrap">
					<div className="caps-head">
						<div className="rv">
							<div className="eyebrow">02 — Architectural advantages</div>
							<h2 className="big">
								Four ideas we got <em>right.</em>
							</h2>
						</div>
						<p className="rv" data-d=".12s">
							Cards file themselves as you scroll — like folders dropped onto a
							desk. Measured, not marketed.
						</p>
					</div>
					<div className="stack" id="stack">
						<article className="stkc rv">
							<span className="num">01 / RETRACTION</span>
							<div>
								<h3>
									Voice <em>self-correction.</em>
								</h3>
								<p>
									“Gate 2, actually gate 3” never reaches the graph. Retraction
									markers rewrite the slot in place — the transcript stays
									honest, the memory stays clean.
								</p>
							</div>
							<span className="spec">ArkASR + Whisper · 0 phantom writes</span>
						</article>
						<article className="stkc rv">
							<span className="num">02 / EDGE</span>
							<div>
								<h3>
									Reranked <em>semantic recall.</em>
								</h3>
								<p>
									Meaning and keyword search fused, then re-ordered by a free
									cross-encoder — all on plain CPU. Right memory first for 51%
									of LoCoMo questions, in the top 10 for 77% (RESULTS.md) —
									reproducible, not a datasheet promise.
								</p>
							</div>
							<span className="spec">
								Rust WASM · in-process cache · reproducible benchmark
							</span>
						</article>
						<article className="stkc rv">
							<span className="num">03 / UNIVERSAL</span>
							<div>
								<h3>
									Runs <em>everywhere.</em>
								</h3>
								<p>
									Vapi, LiveKit, Pipecat, Claude, GPT, Gemini, Codex — one
									memory core, one thin adapter per provider. Your agent keeps
									its brain; Smaran gives it a past.
								</p>
							</div>
							<span className="spec">
								9 runtimes · MCP · Skill · Tool · SDK
							</span>
						</article>
						<article className="stkc rv">
							<span className="num">04 / INDIC</span>
							<div>
								<h3>
									Hindi + English <em>native.</em>
								</h3>
								<p>
									Romanized Hinglish filler scrubbing, Devanagari detection, and
									DPDP Act alignment baked in from day one — not bolted on
									later.
								</p>
							</div>
							<span className="spec">
								हिंदी + English · DPDP · code-switch aware
							</span>
						</article>
					</div>
				</div>
			</section>

			{/* under the hood */}
			<section className="stack-strip">
				<div className="wrap">
					<div className="ss-head rv">
						<div className="eyebrow">Under the hood</div>
						<h2 className="big">
							Fast because it's <em>built</em> that way.
						</h2>
					</div>
					<div className="ss-grid">
						<div className="ss-cell rv d1">
							<div className="ss-tag">01 · Runtime</div>
							<div className="ss-t">Rust · WASM</div>
							<p>
								Reranker, dedup, and math kernels are Rust compiled to WASM.
								Runs at the edge, in the browser, and inside your worker with
								the same binary. Zero cold-start.
							</p>
						</div>
						<div className="ss-cell rv d2">
							<div className="ss-tag">02 · Store</div>
							<div className="ss-t">Postgres · pgvector · HNSW</div>
							<p>
								Recall fuses four channels — vector (HNSW), keyword (GIN
								full-text), entity graph, and recency decay — via reciprocal
								rank fusion. All on managed Postgres. No vendor lock-in, no
								separate vector DB to operate.
							</p>
						</div>
						<div className="ss-cell rv d3">
							<div className="ss-tag">03 · Edge</div>
							<div className="ss-t">Cloudflare Workers · KV</div>
							<p>
								Hot cache + micro-context injection at 300+ POPs. First byte
								inside the ISP peering the caller, not across the ocean.
							</p>
						</div>
						<div className="ss-cell rv d4">
							<div className="ss-tag">04 · Safety</div>
							<div className="ss-t">DPDP-aligned · SOC 2 ready</div>
							<p>
								Tenant isolation at the row level. PII scrub in-process before
								anything leaves the region. Audit log of every write and every
								recall.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* tape */}
			<section className="tape" id="samples">
				<div className="tape-st">
					<div className="tape-head">
						<div className="rv">
							<div className="eyebrow">03 — Demo</div>
							<h2 className="big">
								How self-correction <em>resolves.</em>
							</h2>
						</div>
						<div
							className="rv"
							data-d=".15s"
							style={{
								display: "flex",
								gap: 36,
								alignItems: "flex-end",
								flexWrap: "wrap",
							}}
						>
							<div className="transport" aria-hidden>
								<svg className="reel" viewBox="0 0 34 34">
									<circle cx="17" cy="17" r="15" />
									<circle className="hub" cx="17" cy="17" r="4" />
									<line x1="17" y1="3" x2="17" y2="13" />
									<line x1="17" y1="21" x2="17" y2="31" />
									<line x1="3" y1="17" x2="13" y2="17" />
									<line x1="21" y1="17" x2="31" y2="17" />
								</svg>
								<div className="tp-line" />
								<svg className="reel" viewBox="0 0 34 34">
									<circle cx="17" cy="17" r="15" />
									<circle className="hub" cx="17" cy="17" r="4" />
									<line x1="17" y1="3" x2="17" y2="13" />
									<line x1="17" y1="21" x2="17" y2="31" />
									<line x1="3" y1="17" x2="13" y2="17" />
									<line x1="21" y1="17" x2="31" y2="17" />
								</svg>
							</div>
							<div className="tp-meta">
								<span className="tp-count">
									<b id="tpIdx">01</b> / 06
								</span>
								<div className="tp-rail">
									<i id="tpFill" />
								</div>
							</div>
						</div>
					</div>
					<div className="t-track" id="tTrack">
						{[
							{
								f: "order-confirm",
								b: "Passed",
								u: "“confirm my order — one two three four, actually four three two one”",
								del: "order #1234",
								add: "order #4321",
							},
							{
								f: "reschedule",
								b: "Refined",
								u: "“let's meet at three pm — sorry — three-thirty pm”",
								del: "meeting 3:00pm",
								add: "meeting 3:30pm",
							},
							{
								f: "contact-update",
								b: "Refined",
								u: "“reply-to is old at ex, wait, new at ex",
								del: "old@ex.com",
								add: "new@ex.com",
							},
							{
								f: "support-ticket",
								b: "Passed",
								u: "“ticket ID is A-four-five-nine, wait, A-four-nine-five”",
								del: "ticket A-459",
								add: "ticket A-495",
							},
							{
								f: "hindi-code-switch",
								b: "Hindi + Eng",
								hin: true,
								u: "“delivery bhejo gate two par, actually gate three”",
								del: "gate 2",
								add: "gate 3",
							},
							{
								f: "progressive-refine",
								b: "Refined",
								u: "“account owner is Acme, Acme Corp Private Limited actually”",
								del: "Acme",
								add: "Acme Corp Pvt Ltd",
							},
						].map((s) => (
							<article key={s.f} className="ac" data-hover>
								<div className="ac-holes">
									{Array.from({ length: 8 }, (_, i) => (
										<i key={i} />
									))}
								</div>
								<div className="ac-top">
									<span className="ac-file">{s.f}</span>
									<span className={`ac-badge${s.hin ? " hin" : ""}`}>
										{s.b}
									</span>
								</div>
								<p className="ac-utt">{s.u}</p>
								<div className="ac-diff">
									<div className="ac-del">− {s.del}</div>
									<div className="ac-add">+ {s.add}</div>
								</div>
								<div className="ac-met">
									<span>Save 13ms</span>
									<b>Recall 140ms</b>
								</div>
							</article>
						))}
					</div>
				</div>
			</section>

			{/* adapters */}
			<section className="code" id="code">
				<div className="wrap code-grid">
					<div className="code-left rv">
						<div className="eyebrow">04 — Developer experience</div>
						<h2 className="big">
							Five lines. <em>Any platform.</em>
						</h2>
						<p>
							One memory core, thin adapters per provider. Pick your stack — the
							past comes with it.
						</p>
						<a
							href="/docs"
							className="btn btn-line"
							data-hover
							style={{ marginTop: 8, marginBottom: 24 }}
						>
							Read the docs →
						</a>
						<div className="vtabs" id="vtabs">
							<button className="vtab on" data-p="p-livekit">
								<i>01</i>LiveKit<span className="arr">→</span>
							</button>
							<button className="vtab" data-p="p-vapi">
								<i>02</i>Vapi<span className="arr">→</span>
							</button>
							<button className="vtab" data-p="p-claude">
								<i>03</i>Anthropic<span className="arr">→</span>
							</button>
							<button className="vtab" data-p="p-openai">
								<i>04</i>OpenAI / Codex<span className="arr">→</span>
							</button>
						</div>
					</div>
					<div className="code-right rv" data-d=".12s">
						<div className="cr-top">
							<span className="cr-file" id="crFile">
								adapter-livekit.ts
							</span>
							<button
								className="copy"
								id="copyBtn"
								data-hover
								data-label="COPY"
							>
								Copy
							</button>
						</div>
						<div className="cpanel on" id="p-livekit">
							<pre>
								<code>{`import { LiveKitVoiceAdapter } from "@smaranai/adapter-livekit";
import { Smaran } from "@smaranai/sdk-ts";

const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY, baseUrl: SMARAN_URL });
const adapter = new LiveKitVoiceAdapter({ memory, sessionId, userId });

// Each final user turn: save it, and inject recalled context before the LLM turn
adapter.onFinalTranscript(turn.text);
const ctx = await adapter.buildContextPrefix(turn.text);`}</code>
							</pre>
						</div>
						<div className="cpanel" id="p-vapi">
							<pre>
								<code>{`import { handleVapiEvent } from "@smaranai/adapter-vapi";
import { Smaran } from "@smaranai/sdk-ts";

const smaran = new Smaran({ apiKey: process.env.SMARAN_API_KEY, baseUrl: SMARAN_URL });

app.post("/vapi-webhook", async (req, res) => {
  const { response } = await handleVapiEvent(req.body.message, { memory: smaran, session, userId });
  res.json(response ?? {});
});`}</code>
							</pre>
						</div>
						<div className="cpanel" id="p-claude">
							<pre>
								<code>{`import { withRecalledContext, memoryTools } from "@smaranai/adapter-anthropic";

const { system, messages } = await withRecalledContext(
  smaran,
  { system: "You are an empathetic voice assistant.", messages: history },
  { userId },
);

const res = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  system, messages,
  tools: memoryTools(),
});`}</code>
							</pre>
						</div>
						<div className="cpanel" id="p-openai">
							<pre>
								<code>{`import { withRecalledContext, memoryTools } from "@smaranai/adapter-openai";

const messages = await withRecalledContext(
  smaran,
  [{ role: "user", content: "Where did I say I moved?" }],
  { userId },
);

const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages,
  tools: memoryTools(),
});`}</code>
							</pre>
						</div>
					</div>
				</div>
			</section>

			{/* cta */}
			<section className="cta">
				<div className="wrap">
					<h2 className="rv">
						Give your agent
						<br />a <em>memory.</em>
					</h2>
					<p className="rv" data-d=".1s">
						Ship voice-memory to production today. SDK, MCP server, Claude
						Skill, and hosted API — take your pick.
					</p>
					<div className="cta-btns rv" data-d=".18s">
						<a
							href="https://github.com/Ayushpani/smaran"
							target="_blank"
							rel="noopener"
							className="btn btn-dark magnet"
							data-hover
							data-label="REPO"
						>
							<span className="btn-label">Star on GitHub</span>
							<span className="btn-arrow" aria-hidden="true">
								<svg viewBox="0 0 14 14" fill="none">
									<path
										d="M3 11L11 3M11 3H5M11 3V9"
										stroke="#fff"
										strokeWidth="1.4"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</span>
						</a>
						<button className="npm" id="npmBtn" data-hover data-label="COPY">
							bun run try
						</button>
					</div>
					<div className="cta-fine rv" data-d=".24s">
						Made in India · स्मरण
					</div>
				</div>
				<canvas id="ctaWave" />
			</section>

			<footer className="footer">
				<div className="wrap foot">
					<div className="foot-brand">
						Smaran <i>स्मरण</i>
					</div>
					<div className="foot-links">
						<a
							href="https://github.com/Ayushpani/smaran"
							target="_blank"
							rel="noopener"
							className="foot-link"
							data-hover
						>
							GitHub
						</a>
						<a href="/docs" className="foot-link" data-hover>
							Docs
						</a>
						<a href="#problem" className="foot-link" data-hover>
							Benchmarks
						</a>
						<a href="#caps" className="foot-link" data-hover>
							Architecture
						</a>
						<a
							href="mailto:ayushpanigrahi84@gmail.com"
							className="foot-link"
							data-hover
						>
							Contact
						</a>
					</div>
					<div className="foot-c">© 2026 — every word, on the record.</div>
				</div>
			</footer>
		</div>
	)
}
