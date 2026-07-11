ALTER TABLE moderation_queue_items
    ADD COLUMN IF NOT EXISTS lease_owner TEXT,
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_failure_code TEXT,
    ADD COLUMN IF NOT EXISTS terminal_failure BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_moderation_queue_claimable
    ON moderation_queue_items (
        queue_status, terminal_failure, next_attempt_at, lease_expires_at,
        requested_at
    );
