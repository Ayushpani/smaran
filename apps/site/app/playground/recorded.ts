/**
 * Shown when this deployment has no live playground backend.
 *
 * The caller lines are the clinic persona's hints. The memory notes are what
 * the Smaran API actually stored and recalled for those exact sentences
 * (Postgres mode, local embedder and reranker); the agent replies are
 * written examples of what a model says with and without those memories.
 */
export const RECORDED: {
	call?: string
	user: string | null
	memory: string
	plain: string
	note: string
}[] = [
	{
		call: "Call 1",
		user: null,
		memory: "Hello, Sunrise Clinic, this is Asha. How can I help?",
		plain: "Hello, Sunrise Clinic, this is Asha. How can I help?",
		note: "Looked up name, appointment, allergies and doctor. Nothing remembered yet.",
	},
	{
		user: "Hi, I'm Rohan. Can I see Dr. Mehta on Friday at 5?",
		memory: "Hi Rohan, Dr. Mehta is free on Friday at 5. Shall I book it?",
		plain: "Hi Rohan, Dr. Mehta is free on Friday at 5. Shall I book it?",
		note: "Saved: “Hi, I'm Rohan. Can I see Dr. Mehta on Friday at 5?”",
	},
	{
		user: "Actually, make it Saturday, not Friday.",
		memory: "Done, Saturday at 5 with Dr. Mehta.",
		plain: "Done, Saturday at 5 with Dr. Mehta.",
		note: "Recalled the booking request in 12 ms. Saved: “make it Saturday, not Friday.”",
	},
	{
		user: "I'm allergic to penicillin.",
		memory: "Noted. I've added your penicillin allergy for Dr. Mehta.",
		plain: "Noted. I've added your penicillin allergy for Dr. Mehta.",
		note: "Saved: “I'm allergic to penicillin.”",
	},
	{
		call: "Call 2, the next day",
		user: null,
		memory:
			"Hi Rohan, it's Asha from Sunrise Clinic. Is this about Saturday's appointment with Dr. Mehta?",
		plain: "Hello, Sunrise Clinic, this is Asha. How can I help?",
		note: "Recalled 3 memories in 28 ms: the penicillin allergy, the move to Saturday, and Rohan's booking request.",
	},
	{
		user: "When is my appointment, and do you have my allergy noted?",
		memory:
			"It's Saturday at 5 with Dr. Mehta, and yes, your penicillin allergy is on file.",
		plain:
			"Sorry, I don't have your details. Could you tell me your name and booking?",
		note: "Recalled the same 3 memories in 24 ms. Not saved: it only asks a question.",
	},
]
