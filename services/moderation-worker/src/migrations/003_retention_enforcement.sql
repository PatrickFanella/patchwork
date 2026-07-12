ALTER TABLE moderation_queue_items
    ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;

ALTER TABLE moderation_audit_records
    ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;

UPDATE moderation_audit_records
SET retention_until = recorded_at + INTERVAL '7 days'
WHERE retention_until IS NULL;

ALTER TABLE moderation_audit_records
    ALTER COLUMN retention_until SET DEFAULT (NOW() + INTERVAL '7 days'),
    ALTER COLUMN retention_until SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_queue_retention
    ON moderation_queue_items (retention_until)
    WHERE queue_status = 'resolved' AND retention_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_audit_retention
    ON moderation_audit_records (retention_until);
