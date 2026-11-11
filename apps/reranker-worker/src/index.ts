import { Hono } from 'hono';

type Bindings = {
  AI: Ai;
};

const app = new Hono<{ Bindings: Bindings }>();

app.post('/v1/rerank', async (c) => {
  try {
    const body = await c.req.json<{
      query: string;
      candidates: Array<{ id: string; content: string; score?: number }>;
      topK?: number;
    }>();

    const { query, candidates, topK = 5 } = body;

    if (!query || !candidates?.length) {
      return c.json({ error: 'Missing query or candidates' }, 400);
    }

    const start = Date.now();

    // Use Cloudflare Workers AI's native reranker model.
    // This runs on Cloudflare's GPU infrastructure — no WASM, no ONNX, no external deps.
    // API schema: { query: string, contexts: string[] }
    const rawAiResult: any = await c.env.AI.run(
      '@cf/baai/bge-reranker-base' as BaseAiTextClassificationModels,
      {
        query: query,
        contexts: candidates.map((candidate) => ({ text: candidate.content })),
      } as any
    );

    // Cloudflare AI run() binding wraps the array in a 'response' object,
    // and returns results SORTED by score. We must match them back using the 'id' field!
    const scoresArray = Array.isArray(rawAiResult) 
      ? rawAiResult 
      : (rawAiResult?.response || rawAiResult?.result || rawAiResult?.data || []);

    // Combine cross-encoder score with the original vector similarity score
    const ranked = candidates
      .map((candidate, i) => {
        // Find the score for this specific candidate index
        const match = scoresArray.find((r: any) => r.id === i);
        const cScore = match?.score ?? 0;

        return {
          ...candidate,
          crossEncoderScore: cScore,
          vectorScore: candidate.score ?? 0,
          // Weighted blend: 70% cross-encoder, 30% vector similarity
          combinedScore: 0.7 * cScore + 0.3 * (candidate.score ?? 0),
        };
      })
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK);

    return c.json({
      success: true,
      results: ranked,
      latencyMs: Date.now() - start,
      model: '@cf/baai/bge-reranker-base',
      debugAiResult: rawAiResult, // Let's see EXACTLY what it's returning
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Reranker Error:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/health', (c) => c.json({ status: 'ok', model: '@cf/baai/bge-reranker-base' }));

export default app;
