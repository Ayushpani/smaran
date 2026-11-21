import { expect, test } from "bun:test"
import { classifyRevision } from "../src/revision.ts"

const cases: Array<[string, string, string]> = [
	["My room number is 13.", "my room number is 13", "duplicate"],
	["My room number is 13.", "My room number is 913.", "replace"],
	["My phone is 98765.", "My phone is 987654321.", "replace"],
	["My email is old@example.com", "My email is new@example.com", "replace"],
	["I live in Powai.", "I live in Andheri West.", "related"],
	["I am allergic to peanuts.", "I am allergic to penicillin.", "related"],
	[
		"My company is Acme",
		"My company is Acme Corporation Private Limited",
		"related",
	],
	["My wife is Priya.", "My sister is Priya.", "none"],
	["My dog is called Bruno.", "My cat is called Bruno.", "none"],
	["I prefer tea.", "I prefer window seats on flights.", "none"],
	["I live in Powai.", "I prefer tea over coffee.", "none"],
]
for (const [a, b, want] of cases) {
	test(`${a} → ${b} = ${want}`, () => expect(classifyRevision(a, b)).toBe(want))
}
