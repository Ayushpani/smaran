-- Self-serve signup: per-tenant plan and limits, and single-use invite
-- codes. NULL limits mean "server default" (rate) / "unlimited" (memories),
-- so existing tenants keep their current behaviour.

ALTER TABLE tenants
	ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
	ADD COLUMN IF NOT EXISTS contact_email text,
	ADD COLUMN IF NOT EXISTS memory_quota integer,
	ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer;

CREATE TABLE IF NOT EXISTS invites (
	code_hash text PRIMARY KEY,
	note text,
	created_at timestamptz NOT NULL DEFAULT now(),
	used_at timestamptz,
	tenant_id text REFERENCES tenants(id) ON DELETE SET NULL
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
