#!/usr/bin/env bash
# Packs every publishable package, installs the tarballs into a fresh
# project outside the workspace with npm, then type-checks a consumer
# against the published .d.ts (strict, NodeNext) and runs it under plain
# Node against a sandbox Smaran API. Gate for publishing to npm.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKGS=(sdk-ts adapter-anthropic adapter-openai adapter-google adapter-vercel-ai adapter-langgraph adapter-mastra adapter-vapi adapter-livekit)
WORK="$(mktemp -d)"
trap 'kill ${API_PID:-} 2>/dev/null || true; rm -rf "$WORK"' EXIT

cd "$ROOT"
bun run scripts/build-package.ts "${PKGS[@]/#/packages/}"
mkdir -p "$WORK/tarballs" "$WORK/app"
for p in "${PKGS[@]}"; do (cd "packages/$p/dist-publish" && npm pack --silent --pack-destination "$WORK/tarballs" >/dev/null); done

cd "$WORK/app"
npm init -y >/dev/null && npm pkg set type=module >/dev/null
npm install --silent --no-audit --no-fund "$WORK"/tarballs/*.tgz \
  ai@7 @langchain/core@1 @langchain/langgraph@1 @mastra/core@1 zod@4 openai@7 @anthropic-ai/sdk@1 @google/genai@3 typescript@5.8.3
cp "$ROOT/scripts/npm-smoke/smoke.ts" "$ROOT/scripts/npm-smoke/tsconfig.json" .
npx tsc -p .

(cd "$ROOT" && STORE=memory EMBEDDER=hash RERANKER=none PORT=8779 bun run apps/api/src/index.ts >/dev/null 2>&1) &
API_PID=$!
for _ in $(seq 1 60); do curl -sf http://localhost:8779/health >/dev/null && break; sleep 1; done
node --experimental-strip-types --no-warnings smoke.ts
