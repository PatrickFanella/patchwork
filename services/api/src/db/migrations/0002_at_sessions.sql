CREATE TABLE IF NOT EXISTS at_oauth_state (
    state_key_hash TEXT PRIMARY KEY,
    encrypted_payload TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS at_oauth_sessions (
    did TEXT PRIMARY KEY,
    handle TEXT,
    encrypted_payload TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patchwork_browser_sessions (
    session_id_hash TEXT PRIMARY KEY,
    did TEXT NOT NULL REFERENCES at_oauth_sessions(did) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_at_oauth_state_expires
    ON at_oauth_state (expires_at);

CREATE INDEX IF NOT EXISTS idx_patchwork_browser_sessions_did
    ON patchwork_browser_sessions (did)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patchwork_browser_sessions_expires
    ON patchwork_browser_sessions (expires_at)
    WHERE revoked_at IS NULL;
