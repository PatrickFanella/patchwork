-- Migration: 001_create_moderation_tables
-- Creates durable moderation queue and audit tables for the moderation worker.

BEGIN;

-- Moderation queue items table
-- Stores the current state of each moderation subject.
CREATE TABLE IF NOT EXISTS moderation_queue_items (
    subject_uri     TEXT PRIMARY KEY,
    queue_id        TEXT NOT NULL,
    subject_type    TEXT NOT NULL CHECK (subject_type IN ('aid-post', 'conversation', 'directory-resource', 'other')),
    reasons         JSONB NOT NULL DEFAULT '[]',
    latest_reason   TEXT NOT NULL,
    report_count    INTEGER NOT NULL DEFAULT 1,
    queue_status    TEXT NOT NULL DEFAULT 'queued' CHECK (queue_status IN ('queued', 'resolved')),
    visibility      TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'delisted', 'suspended')),
    appeal_state    TEXT NOT NULL DEFAULT 'none' CHECK (appeal_state IN ('none', 'pending', 'under-review', 'upheld', 'rejected')),
    context         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_queue_status ON moderation_queue_items (queue_status);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_visibility ON moderation_queue_items (visibility);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_appeal_state ON moderation_queue_items (appeal_state);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_updated_at ON moderation_queue_items (updated_at DESC);

-- Moderation audit records table
-- Stores the immutable audit trail of all policy actions taken.
CREATE TABLE IF NOT EXISTS moderation_audit_records (
    action_id           TEXT PRIMARY KEY,
    queue_id            TEXT NOT NULL,
    subject_uri         TEXT NOT NULL REFERENCES moderation_queue_items(subject_uri),
    actor_did           TEXT NOT NULL,
    action              TEXT NOT NULL CHECK (action IN (
        'delist', 'suspend-visibility', 'restore-visibility',
        'open-appeal', 'start-appeal-review',
        'resolve-appeal-upheld', 'resolve-appeal-rejected'
    )),
    reason              TEXT NOT NULL,
    occurred_at         TIMESTAMPTZ NOT NULL,
    idempotency_key     TEXT NOT NULL UNIQUE,
    previous_state      JSONB NOT NULL,
    next_state          JSONB NOT NULL,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_subject_uri ON moderation_audit_records (subject_uri);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_actor_did ON moderation_audit_records (actor_did);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_action ON moderation_audit_records (action);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_occurred_at ON moderation_audit_records (occurred_at);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_idempotency ON moderation_audit_records (idempotency_key);

COMMIT;
