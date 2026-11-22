-- Dense recall is an exact search scoped to (tenant, user) — see
-- packages/db/src/store.ts search(). pgvector's HNSW scan filters
-- tenant/user only AFTER picking the ~ef_search nearest rows in the whole
-- table, so in a multi-tenant table it silently drops a user's memories.
-- Nothing queries through this index any more, and maintaining it cost
-- ~15 ms per insert, so drop it. Per-user scans use memories_user_idx /
-- memories_tenant_user_current_idx.
DROP INDEX IF EXISTS memories_embedding_hnsw;
