CREATE TABLE IF NOT EXISTS http_idempotency_commands (
    actor_did TEXT NOT NULL,
    method TEXT NOT NULL,
    pathname TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status_code INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (actor_did, method, pathname, idempotency_key),
    CHECK ((status_code IS NULL) = (completed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_http_idempotency_completed_at
    ON http_idempotency_commands (completed_at);
