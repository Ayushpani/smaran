-- DPDP Act (India) / GDPR consent log. POST /v1/dpdp/consent previously
-- only echoed the request back — nothing was stored, so consent could not
-- be proven. Each row is one grant or withdrawal event; the latest row per
-- (tenant, user, kind) is the current state.

CREATE TABLE IF NOT EXISTS consents (
	id text PRIMARY KEY,
	tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	user_id text NOT NULL,
	session_id text,
	kind text NOT NULL CHECK (kind IN ('record','process','retain','share')),
	granted boolean NOT NULL,
	scope text,
	recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consents_tenant_user_idx
	ON consents (tenant_id, user_id, kind, recorded_at DESC);

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
-- 0003 created profiles without RLS; align with every other tenant table.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
