-- Shared, ephemeral state so several API instances behave as one:
-- streaming-voice turn buffers and per-key rate-limit windows. UNLOGGED:
-- no WAL, so writes are cheap; contents are lost on a database crash,
-- which is acceptable for in-flight turns and rate counters. Live session
-- events use LISTEN/NOTIFY and need no table.

CREATE UNLOGGED TABLE IF NOT EXISTS ingest_buffers (
	tenant_id text NOT NULL,
	session_id text NOT NULL,
	text text NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (tenant_id, session_id)
);
CREATE INDEX IF NOT EXISTS ingest_buffers_updated_idx ON ingest_buffers (updated_at);

CREATE UNLOGGED TABLE IF NOT EXISTS rate_limit_windows (
	key_hash text NOT NULL,
	window_start timestamptz NOT NULL,
	count integer NOT NULL DEFAULT 0,
	PRIMARY KEY (key_hash, window_start)
);

ALTER TABLE ingest_buffers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_windows ENABLE ROW LEVEL SECURITY;
