import { expect, test } from "bun:test"
import { scrubAsrText } from "../src/index.ts"

test("keeps content words that look like fillers", () => {
	expect(scrubAsrText("I like dark mode").text).toBe("I like dark mode")
	expect(scrubAsrText("actually I prefer tea").text).toBe(
		"actually I prefer tea",
	)
})

test("removes hesitation sounds and stutters", () => {
	const r = scrubAsrText("um my my address is uh Bandra West")
	expect(r.text).toBe("my address is Bandra West")
	expect(r.removed).toBe(2)
})
