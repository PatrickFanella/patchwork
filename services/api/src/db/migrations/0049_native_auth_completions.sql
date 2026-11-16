CREATE TABLE IF NOT EXISTS native_auth_completions (
    code_hash TEXT PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
    did TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    app_state TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_native_auth_completions_expiry ON native_auth_completions(expires_at);
