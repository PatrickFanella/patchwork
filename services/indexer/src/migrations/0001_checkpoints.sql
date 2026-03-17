-- Persistent checkpoint storage for the indexer firehose pipeline.
-- Stores the last successfully processed sequence number so the pipeline
-- can resume from where it left off after a restart or deployment.

CREATE TABLE IF NOT EXISTS indexer_checkpoints (
    id TEXT PRIMARY KEY DEFAULT 'default',
    cursor BIGINT NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sequence BIGINT NOT NULL DEFAULT 1
);

-- Provide a quick lookup by saved_at for health/lag monitoring queries.
CREATE INDEX IF NOT EXISTS idx_indexer_checkpoints_saved_at
    ON indexer_checkpoints (saved_at DESC);
