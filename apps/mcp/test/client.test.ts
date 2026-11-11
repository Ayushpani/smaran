import { expect, test } from "bun:test"
import { tokenOverlap } from "../src/client.ts"

test("tokenOverlap identifies a paraphrased match and rejects unrelated text", () => {
	expect(tokenOverlap("I live in Powai", "I live in Powai.")).toBe(1)
	expect(
		tokenOverlap("my dog Bruno", "My dog is called Bruno"),
	).toBeGreaterThanOrEqual(0.5)
	expect(tokenOverlap("my dog Bruno", "I prefer tea over coffee")).toBeLessThan(
		0.5,
	)
})
