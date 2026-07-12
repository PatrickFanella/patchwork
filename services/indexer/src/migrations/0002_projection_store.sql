CREATE TABLE IF NOT EXISTS indexer_aid_post_projections (
    uri TEXT PRIMARY KEY,
    collection TEXT NOT NULL,
    cid TEXT,
    revision TEXT,
    author_did_hash TEXT NOT NULL CHECK (author_did_hash ~ '^[a-f0-9]{64}$'),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    urgency TEXT NOT NULL,
    status TEXT NOT NULL,
    searchable_text TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    precision_km DOUBLE PRECISION NOT NULL CHECK (precision_km >= 1),
    record_created_at TIMESTAMPTZ NOT NULL,
    record_updated_at TIMESTAMPTZ NOT NULL,
    source_cursor BIGINT NOT NULL,
    source_event_id TEXT NOT NULL,
    projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indexer_aid_post_discovery
    ON indexer_aid_post_projections (status, category, urgency, record_updated_at DESC, uri);

CREATE INDEX IF NOT EXISTS idx_indexer_aid_post_cursor
    ON indexer_aid_post_projections (source_cursor);

CREATE TABLE IF NOT EXISTS indexer_projection_events (
    event_id TEXT PRIMARY KEY,
    source_cursor BIGINT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexer_projection_tombstones (
    uri_hash TEXT PRIMARY KEY CHECK (uri_hash ~ '^[a-f0-9]{64}$'),
    source_cursor BIGINT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexer_dead_letters (
    id BIGSERIAL PRIMARY KEY,
    event_fingerprint TEXT NOT NULL UNIQUE CHECK (event_fingerprint ~ '^[a-f0-9]{64}$'),
    source_cursor BIGINT,
    failure_code TEXT NOT NULL,
    diagnostic TEXT NOT NULL CHECK (char_length(diagnostic) <= 500),
    received_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indexer_dead_letters_cursor
    ON indexer_dead_letters (source_cursor, created_at);
