import { describe, expect, test } from "bun:test"
import { createLocalCrossEncoder, shouldRerank } from "../src/index.ts"

describe("shouldRerank (language gate)", () => {
	test("English query over English candidates → rerank", () => {
		expect(
			shouldRerank("where does the user live", [
				"I live in Powai.",
				"I like tea.",
			]),
		).toBe(true)
	})
	test("Hinglish query or mostly-Hinglish pool → keep fused order", () => {
		expect(shouldRerank("user kahan rehta hai", ["I live in Powai."])).toBe(
			false,
		)
		expect(
			shouldRerank("where does the user live", [
				"mera ghar Andheri mein hai",
				"mujhe chai bahut pasand hai",
				"I like tea.",
			]),
		).toBe(false)
	})
})

// Downloads a ~23 MB model on first run (cached after). Set SKIP_MODEL_TESTS=1 to skip offline.
describe.skipIf(!!process.env.SKIP_MODEL_TESTS)("local cross-encoder", () => {
	test("puts the passage that answers the question first", async () => {
		const ce = createLocalCrossEncoder({
			cacheDir: process.env.MODEL_CACHE_DIR ?? "../../.smaran/models",
		})
		const r = await ce.rerank(
			"When did Caroline go to the support group?",
			[
				{
					id: "a",
					text: "Caroline: I love going to the beach with my kids.",
					score: 0.9,
				},
				{
					id: "b",
					text: "Caroline: I went to an LGBTQ support group yesterday and it was powerful.",
					score: 0.1,
				},
				{
					id: "c",
					text: "Melanie: The group photo came out great.",
					score: 0.5,
				},
			],
			3,
		)
		expect(r.candidates[0]!.id).toBe("b")
		expect(r.model).toContain("ms-marco")
	}, 120_000)
})
