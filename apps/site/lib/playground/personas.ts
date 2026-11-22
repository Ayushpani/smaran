/** Demo agents for the playground. Shared by the page and the server. */
export interface Persona {
	id: string
	name: string
	role: string
	/** Speech recognition language for the mic. */
	lang: "en-IN" | "hi-IN"
	/** Instructions for the language model. */
	brief: string
	/** What the memory agent looks up when a new call starts. */
	openingQuery: string
	/** Things to say, including corrections, to see memory work. */
	hints: string[]
	/** Something to ask on a later call. */
	comeBack: string
}

export const PERSONAS: Persona[] = [
	{
		id: "clinic",
		name: "Asha",
		role: "Receptionist at Sunrise Clinic",
		lang: "en-IN",
		brief:
			"You are Asha, the receptionist at Sunrise Clinic. You book, move and confirm appointments with Dr. Mehta and note anything a doctor should know, like allergies.",
		openingQuery: "caller name, appointment, allergies, doctor",
		hints: [
			"Hi, I'm Rohan. Can I see Dr. Mehta on Friday at 5?",
			"Actually, make it Saturday, not Friday.",
			"I'm allergic to penicillin.",
		],
		comeBack: "When is my appointment, and do you have my allergy noted?",
	},
	{
		id: "hotel",
		name: "Kabir",
		role: "Front desk at Harbour Hotel",
		lang: "en-IN",
		brief:
			"You are Kabir at the front desk of Harbour Hotel. You help guests with room service, wake-up calls, late checkout and local tips.",
		openingQuery: "guest name, room number, requests, preferences",
		hints: [
			"I'm in room 13, sorry, 913.",
			"Wake me up at 6 tomorrow, I have an early flight.",
			"I'm vegetarian, please remember that for room service.",
		],
		comeBack: "What's my room number, and what time is my wake-up call?",
	},
	{
		id: "pizza",
		name: "Pinky",
		role: "Orders at Slice of Bombay (Hinglish)",
		lang: "en-IN",
		brief:
			"You are Pinky, taking phone orders for Slice of Bombay, a pizza place in Mumbai. Reply in friendly Hinglish (Hindi in Latin letters mixed with English), the way the caller speaks.",
		openingQuery: "usual order, address, preferences, name",
		hints: [
			"Mujhe ek large margherita chahiye, nahi, medium.",
			"Address hai Andheri West, Lokhandwala, flat 12 B wing.",
			"Extra cheese hamesha daalna, please.",
		],
		comeBack: "Mera usual order aur address kya hai?",
	},
	{
		id: "loan",
		name: "Meera",
		role: "EMI reminders at Udaan Finance (Hinglish)",
		lang: "en-IN",
		brief:
			"You are Meera from Udaan Finance, calling customers about upcoming loan EMIs. Be polite and brief, reply in the caller's mix of Hindi and English, and record promises to pay and preferred call times. Never ask for card numbers, PINs or OTPs.",
		openingQuery: "promise to pay date, EMI amount, preferred call time, name",
		hints: [
			"Main 5 tareekh ko pay kar dunga, nahi, 7 tareekh ko.",
			"Please call me after 6 pm, office mein busy rehta hoon.",
			"Mera naam Arjun hai.",
		],
		comeBack: "Maine kab pay karne ka bola tha?",
	},
]

export const personaById = (id: string) => PERSONAS.find((p) => p.id === id)
