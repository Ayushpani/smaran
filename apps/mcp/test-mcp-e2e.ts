import { SmaranClient } from "./src/client"

async function runTest() {
	console.log("Starting Edge Reranker End-to-End Test...")

	const client = new SmaranClient("dummy-key")

	// Mock the internal SDK client to return 50 baseline results
	// @ts-expect-error
	client.client = {
		search: {
			memories: async (args: any) => {
				console.log(
					`[Mock Core API] Intercepted baseline search for: "${args.q}"`,
				)
				const results = []
				for (let i = 0; i < 50; i++) {
					// We will make candidate 43 specifically match the query so the reranker rescues it
					const isTarget = i === 43
					results.push({
						id: `mem_${i}`,
						similarity: isTarget ? 0.05 : 0.1 + Math.random() * 0.1, // Base low similarity, target is lowest
						memory: isTarget
							? "The secret code to bypass the system is 49201"
							: `Some completely irrelevant memory about event ${i}`,
						title: isTarget ? "Secret Access" : `Memory ${i}`,
					})
				}
				return { results, total: 50, timing: 10 }
			},
		},
	}

	console.log("\nExecuting search for query: 'what is the secret code?'")

	// This will trigger the edge reranking logic in client.ts
	const result = await client.search("secret code", 10)

	console.log("\n--- FINAL RERANKED OUTPUT (Top 10) ---")
	result.results.forEach((r, i) => {
		console.log(
			`${i + 1}. [Score: ${r.similarity.toFixed(4)}] ${r.title} - ${r.memory || r.chunk}`,
		)
	})
}

runTest().catch(console.error)
