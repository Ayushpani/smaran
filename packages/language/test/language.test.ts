import { describe, expect, test } from "bun:test"
import { applySelfCorrection, normalizeCodeSwitched } from "../src/index.ts"

describe("applySelfCorrection", () => {
	const cases: Array<[string, string]> = [
		[
			"i live in powai, no... actual trikutta towers powai, room number 13... sorry 913",
			"trikutta towers powai, room number 913",
		],
		["my name is Ayush, sorry Ayushpani", "Ayushpani"],
		["my phone is 98765, wait no, 987654321", "my phone is 987654321"],
	]
	for (const [input, expected] of cases) {
		test(input, () => {
			expect(applySelfCorrection(input).text).toBe(expected)
		})
	}

	test("a cue followed by a full new clause keeps both facts", () => {
		const r = applySelfCorrection(
			"I love sushi. Sorry, I have a meeting at 5pm",
		)
		expect(r.text).toContain("I love sushi")
		expect(r.text).toContain("I have a meeting at 5pm")
	})

	test("'no' inside ordinary speech is not a cue", () => {
		const input = "no one is home, my number is 98200 12345"
		expect(applySelfCorrection(input).text).toBe(input)
	})
})

describe("normalizeCodeSwitched", () => {
	test("romanized Hinglish is flagged as code-switched", () => {
		for (const t of [
			"mera ghar hai",
			"mera ghar bahut accha hai Andheri mein",
		]) {
			const r = normalizeCodeSwitched(t)
			expect(r.wasCodeSwitched).toBe(true)
			expect(r.primary).toBe("mixed")
		}
	})

	test("plain English stays English", () => {
		const r = normalizeCodeSwitched("I prefer window seats on long flights")
		expect(r.wasCodeSwitched).toBe(false)
		expect(r.primary).toBe("en")
	})
})

describe("applySelfCorrection — cue position", () => {
	test("mid-sentence cue with a long correction replaces the prior clause", () => {
		const r = applySelfCorrection(
			"mera address hai andheri, actually bandra west, flat number 21, no 12",
		)
		expect(r.text).not.toContain("andheri")
		expect(r.text).toContain("bandra west")
		expect(r.text).toContain("12")
	})

	test("sentence-initial cue with a short fragment is still a correction", () => {
		expect(
			applySelfCorrection("I live in Powai. Actually, Andheri.").text,
		).toBe("Andheri")
	})
})
