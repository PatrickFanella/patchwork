ALTER TABLE moderation_queue_items
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    ADD COLUMN IF NOT EXISTS reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(reason_codes) = 'array'),
    ADD COLUMN IF NOT EXISTS safe_preview JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (
            jsonb_typeof(safe_preview) = 'object'
            AND safe_preview::text !~* '"(message|password|exactLatitude|exactLongitude|latitude|longitude|streetAddress|contactEmail|contactPhone|privateNotes|reason|details)"[[:space:]]*:'
        ),
    ADD COLUMN IF NOT EXISTS automated_decision TEXT
        CHECK (
            automated_decision IS NULL
            OR automated_decision IN ('accepted', 'quarantined', 'rejected')
        );

CREATE INDEX IF NOT EXISTS idx_moderation_queue_console
    ON moderation_queue_items (
        queue_status, priority, appeal_state, requested_at, subject_uri
    );

CREATE TABLE IF NOT EXISTS moderation_submission_reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    actor_did TEXT NOT NULL,
    subject_uri TEXT NOT NULL,
    submission_type TEXT NOT NULL CHECK (
        submission_type IN (
            'aid-post', 'directory-resource', 'volunteer-profile'
        )
    ),
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update')),
    content_hash TEXT NOT NULL CHECK (
        content_hash ~ '^[a-f0-9]{64}$'
    ),
    provider_version TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (
        decision IN ('accepted', 'quarantined', 'rejected')
    ),
    priority TEXT NOT NULL CHECK (
        priority IN ('low', 'normal', 'high', 'urgent')
    ),
    reason_codes JSONB NOT NULL CHECK (
        jsonb_typeof(reason_codes) = 'array'
    ),
    user_reason_code TEXT NOT NULL,
    user_message TEXT NOT NULL CHECK (
        char_length(user_message) BETWEEN 1 AND 500
    ),
    safe_preview JSONB NOT NULL CHECK (
        jsonb_typeof(safe_preview) = 'object'
        AND safe_preview::text !~* '"(message|password|exactLatitude|exactLongitude|latitude|longitude|streetAddress|contactEmail|contactPhone|privateNotes|reason|details)"[[:space:]]*:'
    ),
    reviewed_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL,
    UNIQUE (subject_uri, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_moderation_submission_reviews_subject
    ON moderation_submission_reviews (
        subject_uri, reviewed_at DESC, review_id
    );

CREATE INDEX IF NOT EXISTS idx_moderation_submission_reviews_retention
    ON moderation_submission_reviews (retention_until, review_id);

CREATE TABLE IF NOT EXISTS moderation_notification_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_uri TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('high', 'urgent')),
    reason_codes JSONB NOT NULL CHECK (
        jsonb_typeof(reason_codes) = 'array'
    ),
    deduplication_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    retention_until TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_moderation_notification_pending
    ON moderation_notification_events (created_at, event_id)
    WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_notification_retention
    ON moderation_notification_events (retention_until, event_id);
