CREATE TABLE IF NOT EXISTS discovery_events (
    event_id TEXT PRIMARY KEY,
    seq BIGINT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    uri TEXT NOT NULL,
    collection TEXT NOT NULL,
    author_did TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    payload JSONB,
    delete_reason TEXT,
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_events_seq
    ON discovery_events (seq ASC);
