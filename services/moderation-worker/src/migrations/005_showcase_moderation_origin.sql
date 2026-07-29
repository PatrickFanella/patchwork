ALTER TABLE moderation_queue_items
    ADD COLUMN IF NOT EXISTS record_origin TEXT NOT NULL
        DEFAULT 'visitor-created'
        CHECK (
            record_origin IN (
                'synthetic', 'sourced-public', 'visitor-created'
            )
        ),
    ADD COLUMN IF NOT EXISTS seed_version TEXT;

ALTER TABLE moderation_queue_items
    ADD CONSTRAINT moderation_seed_origin_consistency CHECK (
        (record_origin = 'synthetic' AND seed_version IS NOT NULL)
        OR (record_origin <> 'synthetic' AND seed_version IS NULL)
    );

CREATE INDEX IF NOT EXISTS idx_moderation_queue_origin
    ON moderation_queue_items (record_origin, seed_version, requested_at);
