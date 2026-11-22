"use client"

import { useEffect, useRef, useState } from "react"
import type * as THREE from "three"
import { gsap, motionOn, ScrollTrigger } from "@/lib/gsap"
import { PALETTE_EVENT, token } from "@/lib/palette"
import { Reveal } from "./reveal"

const STEPS = [
	{
		title: "A turn arrives as sound.",
		body: "Speech streams in as partial transcripts while the caller talks. Nothing is stored until the turn ends.",
		rail: "Sound",
	},
	{
		title: "Corrections leave before storage.",
		body: "“21, no wait, 12” keeps 12. Fillers and stutters go too, and Hindi cues like “nahi” and “matlab” count.",
		rail: "Words",
	},
	{
		title: "Indexed three ways.",
		body: "A multilingual meaning vector, a keyword index, and a graph of the people and places mentioned. All on your server, in Postgres with pgvector.",
		rail: "Index",
	},
	{
		title: "Every fact keeps a timeline.",
		body: "When a value changes, the old one is closed with the date it stopped being true. Ask about the past and you get the past.",
		rail: "Time",
	},
	{
		title: "Recall in one pass.",
		body: "The three rankings are fused and a small local model reranks the top 40. About 140 ms on a CPU, or 15 ms without reranking.",
		rail: "Recall",
	},
] as const

const WORDS = ["my", "flat", "is", "21,", "no wait,", "12,", "B", "wing", ""]
const DATES = ["3 Oct", "19 Oct", "2 Nov", "14 Nov", "20 Nov"]
const LAST = STEPS.length - 1

function mulberry32(seed: number) {
	let a = seed
	return () => {
		a |= 0
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const ease = (x: number) =>
	x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

export function Architecture() {
	const secRef = useRef<HTMLElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const labelsRef = useRef<HTMLDivElement>(null)
	const headRef = useRef<HTMLDivElement>(null)
	const [active, setActive] = useState(0)

	const goTo = (k: number) => {
		const sec = secRef.current
		if (!sec) return
		const top = sec.getBoundingClientRect().top + window.scrollY
		const span = sec.offsetHeight - window.innerHeight
		window.scrollTo({ top: top + (k / LAST) * span + 2, behavior: "smooth" })
	}

	useEffect(() => {
		const sec = secRef.current
		const canvas = canvasRef.current
		const labelLayer = labelsRef.current
		const head = headRef.current
		if (!sec || !canvas || !labelLayer || !motionOn()) return
		// three.js loads only when this section mounts, off the critical path.
		let disposed = false
		let teardown: (() => void) | undefined
		void import("three").then((THREE) => {
			if (disposed) return
			teardown = start(THREE)
		})
		return () => {
			disposed = true
			teardown?.()
		}

		function start(THREE: typeof import("three")): () => void {
			if (!sec || !canvas || !labelLayer) return () => {}

			let target = 0
			let current = 0
			let shown = -1
			const st = ScrollTrigger.create({
				trigger: sec,
				start: "top top",
				end: "bottom bottom",
				onUpdate: (self) => {
					target = self.progress
				},
			})

			let renderer: THREE.WebGLRenderer
			try {
				renderer = new THREE.WebGLRenderer({
					canvas,
					antialias: true,
					alpha: true,
					powerPreference: "high-performance",
				})
			} catch {
				canvas.style.display = "none"
				const tick = () => {
					const k = Math.round(target * LAST)
					if (k !== shown) {
						shown = k
						setActive(k)
					}
				}
				gsap.ticker.add(tick)
				return () => {
					gsap.ticker.remove(tick)
					st.kill()
				}
			}
			renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
			renderer.setClearColor(0x000000, 0)

			const scene = new THREE.Scene()
			const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
			const group = new THREE.Group()
			scene.add(group)

			const small = window.innerWidth < 700
			const N = small ? 1500 : 2600
			const R = mulberry32(7)
			const gauss = () => {
				let u = 0
				let v = 0
				while (u === 0) u = R()
				while (v === 0) v = R()
				return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
			}

			// Per-point roles
			const block = new Uint8Array(N)
			const retract = new Uint8Array(N)
			const struct = new Uint8Array(N)
			const layer = new Uint8Array(N)
			const fact = new Uint8Array(N) // 1 = old value, 2 = new value
			const hit = new Uint8Array(N)
			const delay = new Float32Array(N)
			const bright = new Float32Array(N)
			for (let i = 0; i < N; i++) {
				block[i] = i % 9
				retract[i] = block[i] === 3 || block[i] === 4 ? 1 : 0
				struct[i] = i % 3
				layer[i] = i % 5
				if (!retract[i] && i % 7 === 0) {
					if (layer[i] === 1) fact[i] = 1
					else if (layer[i] === 3) fact[i] = 2
				}
				hit[i] = !retract[i] && i % 13 === 0 ? 1 : 0
				delay[i] = R() * 0.35
				bright[i] = 0.55 + 0.45 * R()
			}

			// Layouts. L0 (sound) is recomputed every frame; the rest are fixed.
			const L = Array.from(
				{ length: STEPS.length },
				() => new Float32Array(N * 3),
			)
			const jit = Float32Array.from({ length: N * 3 }, () => R() - 0.5)
			const nodes: THREE.Vector3[] = []
			for (let k = 0; k < 11; k++) {
				const v = new THREE.Vector3(gauss(), gauss(), gauss())
				nodes.push(v.setLength(0.4 + 1.4 * Math.cbrt(R())))
			}
			const colH = Array.from({ length: 25 }, () => 0.5 + 2.8 * R())
			for (let i = 0; i < N; i++) {
				const o = i * 3
				// L1: nine word blocks
				const b = block[i]!
				const L1 = L[1]!
				L1[o] = -6 + b * 1.5 + jit[o]! * 1.1
				L1[o + 1] = jit[o + 1]! * 0.64 + (retract[i] ? 0.18 : 0)
				L1[o + 2] = jit[o + 2]! * 0.6
				// L2: meaning cloud, keyword columns, people-and-places graph
				const L2 = L[2]!
				if (retract[i]) {
					L2[o] = L1[o]!
					L2[o + 1] = -10 - R() * 3
					L2[o + 2] = L1[o + 2]!
				} else if (struct[i] === 0) {
					const v = new THREE.Vector3(gauss(), gauss(), gauss()).setLength(
						1.7 * Math.cbrt(R()),
					)
					L2[o] = -4.6 + v.x
					L2[o + 1] = 0.2 + v.y
					L2[o + 2] = v.z
				} else if (struct[i] === 1) {
					const c = i % 25
					L2[o] = -1.6 + (c % 5) * 0.8 + jit[o]! * 0.12
					L2[o + 1] = -1.5 + R() * colH[c]!
					L2[o + 2] = -1.6 + Math.floor(c / 5) * 0.8 + jit[o + 2]! * 0.12
				} else {
					const n = nodes[i % nodes.length]!
					L2[o] = 4.6 + n.x + gauss() * 0.13
					L2[o + 1] = 0.2 + n.y + gauss() * 0.13
					L2[o + 2] = n.z + gauss() * 0.13
				}
				// L3: a deck of time slices along x
				const L3 = L[3]!
				if (retract[i]) {
					L3[o] = L2[o]!
					L3[o + 1] = L2[o + 1]!
					L3[o + 2] = L2[o + 2]!
				} else {
					const k = layer[i]!
					L3[o] = -5 + k * 2.5 + jit[o]! * 0.06
					if (fact[i]) {
						L3[o + 1] = 0.9 + gauss() * 0.13
						L3[o + 2] = 0.7 + gauss() * 0.13
					} else {
						L3[o + 1] = jit[o + 1]! * 3.6
						L3[o + 2] = jit[o + 2]! * 3.6
					}
				}
				// L4: recalled memories converge; everything else drifts outward
				const L4 = L[4]!
				if (retract[i]) {
					L4[o] = L3[o]!
					L4[o + 1] = L3[o + 1]!
					L4[o + 2] = L3[o + 2]!
				} else if (hit[i]) {
					L4[o] = gauss() * 0.22
					L4[o + 1] = gauss() * 0.22
					L4[o + 2] = gauss() * 0.22
				} else {
					const v = new THREE.Vector3(gauss(), gauss(), gauss()).setLength(
						5.5 + R() * 3,
					)
					L4[o] = v.x
					L4[o + 1] = v.y * 0.7
					L4[o + 2] = v.z - 2
				}
			}

			const pos = new Float32Array(N * 3)
			const col = new Float32Array(N * 3)
			const geo = new THREE.BufferGeometry()
			geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
			geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
			const dot = document.createElement("canvas")
			dot.width = dot.height = 64
			const dctx = dot.getContext("2d")
			if (dctx) {
				const g = dctx.createRadialGradient(32, 32, 0, 32, 32, 32)
				g.addColorStop(0, "rgba(255,255,255,1)")
				g.addColorStop(0.55, "rgba(255,255,255,1)")
				g.addColorStop(1, "rgba(255,255,255,0)")
				dctx.fillStyle = g
				dctx.beginPath()
				dctx.arc(32, 32, 32, 0, Math.PI * 2)
				dctx.fill()
			}
			const tex = new THREE.CanvasTexture(dot)
			const mat = new THREE.PointsMaterial({
				size: small ? 0.09 : 0.075,
				map: tex,
				vertexColors: true,
				transparent: true,
				alphaTest: 0.05,
				depthWrite: false,
				sizeAttenuation: true,
			})
			group.add(new THREE.Points(geo, mat))

			// Graph edges (stage 2)
			const edgePos: number[] = []
			nodes.forEach((a, ia) => {
				const near = nodes
					.map((b, ib) => ({ ib, d: a.distanceTo(b) }))
					.filter((x) => x.ib !== ia)
					.sort((x, y) => x.d - y.d)
					.slice(0, 2)
				for (const { ib } of near) {
					const b = nodes[ib]!
					edgePos.push(4.6 + a.x, 0.2 + a.y, a.z, 4.6 + b.x, 0.2 + b.y, b.z)
				}
			})
			const edgeGeo = new THREE.BufferGeometry()
			edgeGeo.setAttribute(
				"position",
				new THREE.Float32BufferAttribute(edgePos, 3),
			)
			const edgeMat = new THREE.LineBasicMaterial({
				transparent: true,
				opacity: 0,
			})
			group.add(new THREE.LineSegments(edgeGeo, edgeMat))

			// Time slice frames (stage 3)
			const frameMat = new THREE.LineBasicMaterial({
				transparent: true,
				opacity: 0,
			})
			for (let k = 0; k < 5; k++) {
				const x = -5 + k * 2.5
				const g = new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(x, -1.9, -1.9),
					new THREE.Vector3(x, 1.9, -1.9),
					new THREE.Vector3(x, 1.9, 1.9),
					new THREE.Vector3(x, -1.9, 1.9),
				])
				group.add(new THREE.LineLoop(g, frameMat))
			}
			// The fact's thread across time (stage 3)
			const threadGeo = new THREE.BufferGeometry().setFromPoints([
				new THREE.Vector3(-2.5, 0.9, 0.7),
				new THREE.Vector3(2.5, 0.9, 0.7),
			])
			const threadMat = new THREE.LineBasicMaterial({
				transparent: true,
				opacity: 0,
			})
			group.add(new THREE.Line(threadGeo, threadMat))
			// The query ray (stage 4)
			const rayGeo = new THREE.BufferGeometry().setFromPoints([
				new THREE.Vector3(-9, 4.5, 3),
				new THREE.Vector3(0, 0, 0),
			])
			const rayMat = new THREE.LineBasicMaterial({
				transparent: true,
				opacity: 0,
			})
			group.add(new THREE.Line(rayGeo, rayMat))

			// HTML labels pinned to 3D points
			type Label = { el: HTMLSpanElement; at: THREE.Vector3; stage: number }
			const labels: Label[] = []
			const addLabel = (
				text: string,
				at: THREE.Vector3,
				stage: number,
				cls = "",
			) => {
				const s = document.createElement("span")
				s.className = `arch-label ${cls}`
				s.textContent = text
				labelLayer.append(s)
				labels.push({ el: s, at, stage })
			}
			WORDS.forEach((w, b) => {
				if (w)
					addLabel(
						w,
						new THREE.Vector3(-6 + b * 1.5, 0.75, 0),
						1,
						b === 3 || b === 4 ? "gone" : "",
					)
			})
			addLabel("By meaning", new THREE.Vector3(-4.6, 2.35, 0), 2)
			addLabel("By exact words", new THREE.Vector3(0, 2.35, 0), 2)
			addLabel("By places and people", new THREE.Vector3(4.6, 2.35, 0), 2)
			DATES.forEach((d, k) =>
				addLabel(d, new THREE.Vector3(-5 + k * 2.5, 2.25, -1.9), 3),
			)
			addLabel(
				"13, closed 2 Nov",
				new THREE.Vector3(-2.5, 1.45, 0.7),
				3,
				"gone",
			)
			addLabel("913, current", new THREE.Vector3(2.5, 1.45, 0.7), 3, "keep")
			addLabel("Recalled: room 913", new THREE.Vector3(0, 0.75, 0), 4, "keep")

			const CAM = [
				{ p: new THREE.Vector3(0, 0, 12.5), l: new THREE.Vector3(0, 0, 0) },
				{ p: new THREE.Vector3(0, 0.4, 11), l: new THREE.Vector3(0, 0, 0) },
				{ p: new THREE.Vector3(0, 1.8, 13), l: new THREE.Vector3(0, 0.9, 0) },
				{
					p: new THREE.Vector3(-7.5, 3.2, 8.5),
					l: new THREE.Vector3(0.5, 0, 0),
				},
				{ p: new THREE.Vector3(0, 0.8, 9.5), l: new THREE.Vector3(0, 0, 0) },
			]

			const C = {
				base: new THREE.Color(),
				bg: new THREE.Color(),
				fix: new THREE.Color(),
				keep: new THREE.Color(),
			}
			const readColors = () => {
				C.base.set(token("--deep-fg") || "#ecece9")
				C.bg.set(token("--deep") || "#0f1016")
				C.fix.set(token("--fix") || "#ff5b3a")
				C.keep.set(token("--keep-deep") || "#9fb0ff")
				edgeMat.color.copy(C.base)
				frameMat.color.copy(C.base)
				threadMat.color.copy(C.keep)
				rayMat.color.copy(C.keep)
			}
			readColors()
			window.addEventListener(PALETTE_EVENT, readColors)

			// Size and framing
			let fit = 1
			const resize = () => {
				const w = canvas.clientWidth
				const h = canvas.clientHeight
				if (!w || !h) return
				renderer.setSize(w, h, false)
				camera.aspect = w / h
				camera.updateProjectionMatrix()
				fit = Math.min(1, camera.aspect / 1.45)
				group.scale.setScalar(Math.max(0.5, fit))
			}
			const ro = new ResizeObserver(resize)
			ro.observe(canvas)
			resize()

			// Pointer: parallax, plus drag to turn the whole structure
			let px = 0
			let py = 0
			let yaw = 0
			let vel = 0
			let dragging = false
			let lastX = 0
			const onMove = (e: PointerEvent) => {
				const r = canvas.getBoundingClientRect()
				px = ((e.clientX - r.left) / r.width) * 2 - 1
				py = ((e.clientY - r.top) / r.height) * 2 - 1
				if (dragging) {
					vel = (e.clientX - lastX) * 0.006
					yaw += vel
					lastX = e.clientX
				}
			}
			const onDown = (e: PointerEvent) => {
				dragging = true
				lastX = e.clientX
			}
			const onUp = () => {
				dragging = false
			}
			canvas.addEventListener("pointermove", onMove)
			canvas.addEventListener("pointerdown", onDown)
			window.addEventListener("pointerup", onUp)

			const tmpC = new THREE.Color()
			const v3 = new THREE.Vector3()
			const camP = new THREE.Vector3()
			const camL = new THREE.Vector3()
			let visible = false
			const io = new IntersectionObserver(([e]) => {
				visible = !!e?.isIntersecting
			})
			io.observe(sec)

			const frame = (time: number) => {
				if (!visible) return
				const t = time
				current += (target - current) * 0.085
				const s = current * LAST
				const k = Math.min(LAST - 1, Math.floor(s))
				const f = s - k
				const w = (n: number) => Math.max(0, 1 - Math.abs(s - n))
				// The heading makes room once the structure starts to form.
				if (head) {
					const ho = clamp01(1 - s * 1.4)
					head.style.opacity = String(ho)
					head.style.transform = `translateY(${(1 - ho) * -24}px)`
				}
				const step = Math.round(s)
				if (step !== shown) {
					shown = step
					setActive(step)
				}

				// L0: a living waveform
				const L0 = L[0]!
				const per = Math.ceil(N / 6)
				for (let i = 0; i < N; i++) {
					const o = i * 3
					const strand = i % 6
					const u = Math.floor(i / 6) / per
					const env = Math.sin(Math.PI * u) ** 1.2
					L0[o] = -7 + 14 * u
					L0[o + 1] =
						env *
							(0.95 * Math.sin(u * 18 + t * 2.2 + strand * 0.45)) *
							(0.6 + 0.4 * Math.sin(u * 5 + t * 0.9)) +
						jit[o + 1]! * 0.05
					L0[o + 2] = (strand - 2.5) * 0.22 + jit[o + 2]! * 0.05
				}

				const A = L[k]!
				const B = L[k + 1]!
				for (let i = 0; i < N; i++) {
					const o = i * 3
					const fi = ease(clamp01(f * 1.35 - delay[i]!))
					pos[o] = A[o]! + (B[o]! - A[o]!) * fi
					pos[o + 1] = A[o + 1]! + (B[o + 1]! - A[o + 1]!) * fi
					pos[o + 2] = A[o + 2]! + (B[o + 2]! - A[o + 2]!) * fi
					// gentle life in every stage
					pos[o + 1] += Math.sin(t * 0.8 + i) * 0.015

					tmpC.copy(C.base)
					if (retract[i]) {
						tmpC.lerp(C.fix, clamp01(s - 0.45) * 1)
						tmpC.lerp(C.bg, clamp01(s - 1.25))
					} else {
						if (fact[i] === 1) tmpC.lerp(C.fix, w(3) * 0.85)
						if (fact[i] === 2) tmpC.lerp(C.keep, w(3))
						if (hit[i]) tmpC.lerp(C.keep, clamp01(s - 3))
						else tmpC.lerp(C.bg, 0.68 * clamp01(s - 3))
						if (struct[i] === 1) tmpC.lerp(C.keep, 0.25 * w(2))
					}
					tmpC.lerp(C.bg, 1 - bright[i]!)
					col[o] = tmpC.r
					col[o + 1] = tmpC.g
					col[o + 2] = tmpC.b
				}
				geo.attributes.position!.needsUpdate = true
				geo.attributes.color!.needsUpdate = true

				edgeMat.opacity = 0.45 * w(2)
				frameMat.opacity = 0.32 * w(3)
				threadMat.opacity = 0.9 * w(3)
				rayMat.opacity = 0.85 * clamp01(s - 3)

				// camera
				const ef = ease(f)
				camP.lerpVectors(CAM[k]!.p, CAM[k + 1]!.p, ef)
				camL.lerpVectors(CAM[k]!.l, CAM[k + 1]!.l, ef)
				camP.multiplyScalar(1 + (1 - fit) * 0.35)
				camera.position.set(camP.x + px * 0.6, camP.y - py * 0.4, camP.z)
				camera.lookAt(camL)

				if (!dragging) {
					vel *= 0.94
					yaw += vel
					yaw *= 0.985
				}
				group.rotation.y = yaw + px * 0.14 + Math.sin(t * 0.15) * 0.04
				group.rotation.x = py * 0.06
				group.updateMatrixWorld()

				renderer.render(scene, camera)

				// labels
				const W = canvas.clientWidth
				const H = canvas.clientHeight
				for (const lb of labels) {
					const op =
						lb.stage === 4 ? clamp01(s - 3.4) * 1.6 : w(lb.stage) * 1.6 - 0.6
					if (op <= 0.01) {
						lb.el.style.opacity = "0"
						continue
					}
					v3.copy(lb.at).applyMatrix4(group.matrixWorld).project(camera)
					lb.el.style.opacity = String(Math.min(1, op))
					lb.el.style.transform = `translate(-50%, -100%) translate(${((v3.x + 1) / 2) * W}px, ${((1 - v3.y) / 2) * H}px)`
				}
			}
			gsap.ticker.add(frame)

			return () => {
				gsap.ticker.remove(frame)
				st.kill()
				io.disconnect()
				ro.disconnect()
				window.removeEventListener(PALETTE_EVENT, readColors)
				window.removeEventListener("pointerup", onUp)
				canvas.removeEventListener("pointermove", onMove)
				canvas.removeEventListener("pointerdown", onDown)
				for (const lb of labels) lb.el.remove()
				geo.dispose()
				edgeGeo.dispose()
				threadGeo.dispose()
				rayGeo.dispose()
				mat.dispose()
				tex.dispose()
				edgeMat.dispose()
				frameMat.dispose()
				threadMat.dispose()
				rayMat.dispose()
				renderer.dispose()
			}
		}
	}, [])

	return (
		<section
			className="arch tone-deep"
			data-tone="deep"
			id="architecture"
			ref={secRef}
			aria-labelledby="arch-title"
		>
			<div className="arch-pin">
				<canvas ref={canvasRef} className="arch-canvas" />
				<div ref={labelsRef} className="arch-labels" aria-hidden="true" />
				<div className="wrap arch-copy">
					<div className="arch-head" ref={headRef}>
						<p className="kicker">How it works</p>
						<Reveal id="arch-title">From a voice to a memory.</Reveal>
						<p className="arch-hint">
							Scroll to move through it. Drag to turn it.
						</p>
					</div>
					<ol className="arch-steps">
						{STEPS.map((s, k) => (
							<li
								key={s.rail}
								className={`arch-step${k === active ? " on" : ""}`}
							>
								<span className="no">
									{String(k + 1).padStart(2, "0")} / 05
								</span>
								<h3>{s.title}</h3>
								<p>{s.body}</p>
							</li>
						))}
					</ol>
				</div>
				<nav className="arch-rail" aria-label="Jump to a step">
					{STEPS.map((s, k) => (
						<button
							key={s.rail}
							type="button"
							className={k === active ? "on" : ""}
							aria-current={k === active ? "step" : undefined}
							onClick={() => goTo(k)}
						>
							<span>{s.rail}</span>
							<i />
						</button>
					))}
				</nav>
			</div>
		</section>
	)
}
