CREATE TABLE IF NOT EXISTS indexer_projection_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    latest_cursor BIGINT,
    heartbeat_at TIMESTAMPTZ NOT NULL
);
