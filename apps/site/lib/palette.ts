export const PALETTES = ["cobalt", "ink", "chalk"] as const
export type Palette = (typeof PALETTES)[number]
export const PALETTE_KEY = "smaran-palette"
export const PALETTE_EVENT = "smaran:palette"

/**
 * Runs before first paint (inlined in <head>): applies the saved palette so it
 * never flashes, and marks the page "motion" unless reduced motion is asked for.
 */
export const PALETTE_INIT = `(function(){try{var p=localStorage.getItem("${PALETTE_KEY}");if(!/^(cobalt|ink|chalk)$/.test(p||"")){p=window.matchMedia("(prefers-color-scheme: dark)").matches?"ink":"cobalt"}document.documentElement.dataset.palette=p}catch(e){document.documentElement.dataset.palette="cobalt"}try{if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("motion")}catch(e){}})()`

export function currentPalette(): Palette {
	const p = document.documentElement.dataset.palette
	return (PALETTES as readonly string[]).includes(p ?? "")
		? (p as Palette)
		: "cobalt"
}

export function setPalette(p: Palette) {
	document.documentElement.dataset.palette = p
	try {
		localStorage.setItem(PALETTE_KEY, p)
	} catch {}
	window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail: p }))
}

/** Read a CSS custom property from :root (after a palette change). */
export function token(name: string): string {
	return getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim()
}
