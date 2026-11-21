# Smaran API — self-hosted image.
#   docker build -t smaran-api .
# Runs the TypeScript sources directly with Bun (no build step).
FROM oven/bun:1.4.4 AS base
WORKDIR /app

# Install dependencies first for layer caching.
COPY package.json bun.lock ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile

COPY scripts ./scripts

ENV NODE_ENV=production \
    PORT=8787 \
    EMBEDDER=local \
    MODEL_CACHE_DIR=/data/models
# The embedding model (~120 MB) downloads here on first start; mount a
# volume so restarts don't re-download it.
RUN mkdir -p /data && chown bun:bun /data
VOLUME ["/data"]
EXPOSE 8787

USER bun
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=5 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "apps/api/src/index.ts"]
