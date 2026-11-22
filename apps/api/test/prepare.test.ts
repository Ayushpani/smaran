import { describe, expect, test } from "bun:test"
import { isPureQuestion, prepareText } from "../src/prepare.ts"

const stored = (t: string) => {
	const p = prepareText(t)
	return p.skip ? null : p.text
}

describe("question filter", () => {
	test("pure questions are not stored", () => {
		for (const q of [
			"is that 13 or 913?",
			"When is my appointment, and do you have my allergy noted?",
			"What's my room number?",
			"Do you have my address?",
			"Mera usual order aur address kya hai?",
			"Maine kab pay karne ka bola tha?",
			"मेरा कमरा नंबर क्या है?",
		])
			expect(isPureQuestion(q)).toBe(true)
	})

	test("facts said alongside a question are kept, the question is dropped", () => {
		expect(stored("Hi, I'm Rohan. What time do you open?")).toBe(
			"Hi, I'm Rohan.",
		)
		const p = prepareText("I'm in room 913. Is breakfast included?")
		expect(p.skip).toBeUndefined()
		if (!p.skip)
			expect(p.metadata.questionsDropped).toEqual(["Is breakfast included?"])
	})

	test("requests and tag questions carry facts and are kept", () => {
		expect(stored("Hi, I'm Rohan. Can I see Dr. Mehta on Friday at 5?")).toBe(
			"Hi, I'm Rohan. Can I see Dr. Mehta on Friday at 5?",
		)
		expect(stored("Could you wake me up at 6 tomorrow?")).toBe(
			"Could you wake me up at 6 tomorrow?",
		)
		expect(stored("my address is 12 MG Road, right?")).toBe(
			"my address is 12 MG Road, right?",
		)
	})

	test("statements, corrections and one-word turns behave as before", () => {
		expect(stored("I'm in room 13, sorry, 913.")).toBe("I'm in room 913")
		expect(stored("yes")).toBeNull()
		expect(stored("I'm allergic to penicillin.")).toBe(
			"I'm allergic to penicillin.",
		)
	})
})
