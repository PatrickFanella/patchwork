CREATE TABLE IF NOT EXISTS account_deactivations (
    did_hash TEXT PRIMARY KEY CHECK (did_hash ~ '^[a-f0-9]{64}$'),
    command_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'deactivated' CHECK (status = 'deactivated'),
    result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(result) = 'object'
        AND NOT result ?| ARRAY[
            'did', 'password', 'accessJwt', 'refreshJwt', 'access_token',
            'refresh_token', 'exactLatitude', 'exactLongitude'
        ]
    ),
    requested_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_deactivations_retention
    ON account_deactivations (retention_until);
