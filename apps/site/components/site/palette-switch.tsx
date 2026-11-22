"use client"

import { useEffect, useState } from "react"
import {
	currentPalette,
	PALETTE_EVENT,
	PALETTES,
	type Palette,
	setPalette,
} from "@/lib/palette"

const NAMES: Record<Palette, string> = {
	cobalt: "Cobalt",
	ink: "Ink",
	chalk: "Chalk",
}

export function PaletteSwitch({ wide = false }: { wide?: boolean }) {
	const [p, setP] = useState<Palette | null>(null)
	useEffect(() => {
		setP(currentPalette())
		const on = () => setP(currentPalette())
		window.addEventListener(PALETTE_EVENT, on)
		return () => window.removeEventListener(PALETTE_EVENT, on)
	}, [])
	return (
		<fieldset className={`palette${wide ? " wide" : ""}`}>
			<legend className="vh">Palette</legend>
			{wide && (
				<span className="lbl" aria-hidden="true">
					Palette
				</span>
			)}
			{PALETTES.map((name) => (
				<button
					key={name}
					type="button"
					data-p={name}
					aria-pressed={p === name}
					aria-label={wide ? undefined : `${NAMES[name]} palette`}
					title={wide ? undefined : NAMES[name]}
					onClick={() => setPalette(name)}
				>
					{wide ? NAMES[name] : null}
				</button>
			))}
		</fieldset>
	)
}
