# @smaranai/edge-reranker

Blazing fast, WASM-compiled Cross-Encoder Reranker for Cloudflare Workers and Edge environments.
Powered by `tract-onnx` and INT8 quantization, providing near-native inference speeds directly on the Edge.

## Features

- **Zero Cold Start**: Fits entirely in a Cloudflare Worker isolate.
- **Agentic Multi-Variate Scoring**: Not just semantic similarity. Accounts for recency (decay), profile traits, and graph centrality out of the box.
- **Pure Rust/WASM**: No C++ bindings, no `ort` dynamic linking issues.
- **Tiny Payload**: Uses INT8 quantized MS MARCO models.

## Usage

```typescript
import { EdgeReranker } from "@smaranai/edge-reranker"

const reranker = new EdgeReranker()

// Call this once during your Worker initialization
// (Requires model bytes from R2 or Cache)
reranker.init(modelBytes, tokenizerBytes)

// Agentic Reranking
const results = reranker.rerankAgentic(
	"Who is John Doe?",
	[
		{
			id: "mem_1",
			text: "John Doe is a software engineer.",
			created_at_ts: 1670000000,
			last_accessed_ts: 1670000000,
			is_core_profile: true,
			relation_count: 5,
		},
	],
	{
		semantic_weight: 0.8,
		profile_weight: 0.2,
	},
)

console.log(results[0].final_score)
```
