ALTER TABLE private_attachments
    DROP CONSTRAINT IF EXISTS private_attachments_status_check;

ALTER TABLE private_attachments
    ADD COLUMN IF NOT EXISTS filename TEXT,
    ADD COLUMN IF NOT EXISTS subject_ref TEXT,
    ADD COLUMN IF NOT EXISTS upload_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS upload_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS content_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS derivative_object_key TEXT,
    ADD COLUMN IF NOT EXISTS scan_attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_scan_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_scan_error_code TEXT,
    ADD COLUMN IF NOT EXISTS quarantine_reason_code TEXT,
    ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS clean_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

UPDATE private_attachments
SET filename = COALESCE(filename, 'legacy-attachment'),
    upload_expires_at = COALESCE(upload_expires_at, created_at),
    retention_expires_at = COALESCE(
        retention_expires_at,
        created_at + INTERVAL '1 year'
    ),
    status = CASE
        WHEN status = 'pending' THEN 'uploaded'
        ELSE status
    END;

ALTER TABLE private_attachments
    ALTER COLUMN filename SET NOT NULL,
    ALTER COLUMN upload_expires_at SET NOT NULL,
    ALTER COLUMN retention_expires_at SET NOT NULL,
    ADD CONSTRAINT private_attachments_filename_check CHECK (
        char_length(filename) BETWEEN 1 AND 255
        AND filename !~ '[\x00-\x1F\x7F]'
    ),
    ADD CONSTRAINT private_attachments_status_check CHECK (
        status IN (
            'authorized', 'uploaded', 'scanning', 'retry',
            'clean', 'quarantined', 'deletion-pending', 'deleted'
        )
    ),
    ADD CONSTRAINT private_attachments_sha_check CHECK (
        content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'
    ),
    ADD CONSTRAINT private_attachments_derivative_key_check CHECK (
        derivative_object_key IS NULL
        OR (
            derivative_object_key !~ '(^|/)\.\.(/|$)'
            AND derivative_object_key !~ '^/'
        )
    ),
    ADD CONSTRAINT private_attachments_scan_count_check CHECK (
        scan_attempt_count >= 0 AND scan_attempt_count <= 20
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_private_attachments_derivative_key
    ON private_attachments (derivative_object_key)
    WHERE derivative_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_private_attachments_scan_queue
    ON private_attachments (next_scan_at, created_at)
    WHERE status IN ('uploaded', 'retry');

CREATE INDEX IF NOT EXISTS idx_private_attachments_subject
    ON private_attachments (purpose, subject_ref, status)
    WHERE subject_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS attachment_scan_attempts (
    attempt_id UUID PRIMARY KEY,
    attachment_id UUID NOT NULL
        REFERENCES private_attachments(attachment_id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 20),
    scanner_name TEXT NOT NULL CHECK (char_length(scanner_name) BETWEEN 1 AND 80),
    scanner_version TEXT,
    detected_mime TEXT,
    verdict TEXT NOT NULL CHECK (
        verdict IN (
            'started', 'clean', 'malware', 'invalid', 'uncertain', 'error'
        )
    ),
    reason_code TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    UNIQUE (attachment_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_attachment_scan_attempts_attachment
    ON attachment_scan_attempts (attachment_id, attempt_number);

CREATE TABLE IF NOT EXISTS attachment_moderator_actions (
    action_id UUID PRIMARY KEY,
    attachment_id UUID,
    moderator_did TEXT NOT NULL,
    action TEXT NOT NULL CHECK (
        action IN ('quarantine', 'release-for-rescan', 'delete')
    ),
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
    acted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachment_moderator_actions_attachment
    ON attachment_moderator_actions (attachment_id, acted_at);

CREATE TABLE IF NOT EXISTS attachment_deletion_jobs (
    job_id UUID PRIMARY KEY,
    attachment_id UUID,
    object_key TEXT NOT NULL CHECK (
        object_key !~ '(^|/)\.\.(/|$)' AND object_key !~ '^/'
    ),
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 120),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (
        attempt_count BETWEEN 0 AND 100
    ),
    next_attempt_at TIMESTAMPTZ NOT NULL,
    last_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    UNIQUE (object_key)
);

CREATE INDEX IF NOT EXISTS idx_attachment_deletion_jobs_pending
    ON attachment_deletion_jobs (next_attempt_at, created_at)
    WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION enqueue_private_attachment_object_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.object_key IS NOT NULL THEN
        INSERT INTO attachment_deletion_jobs (
            job_id, attachment_id, object_key, reason,
            next_attempt_at, created_at
        ) VALUES (
            gen_random_uuid(), OLD.attachment_id, OLD.object_key,
            COALESCE(OLD.deleted_reason, 'metadata-deleted'), NOW(), NOW()
        ) ON CONFLICT (object_key) DO NOTHING;
    END IF;
    IF OLD.derivative_object_key IS NOT NULL THEN
        INSERT INTO attachment_deletion_jobs (
            job_id, attachment_id, object_key, reason,
            next_attempt_at, created_at
        ) VALUES (
            gen_random_uuid(), OLD.attachment_id,
            OLD.derivative_object_key,
            COALESCE(OLD.deleted_reason, 'metadata-deleted'), NOW(), NOW()
        ) ON CONFLICT (object_key) DO NOTHING;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS private_attachment_delete_objects
    ON private_attachments;
CREATE TRIGGER private_attachment_delete_objects
BEFORE DELETE ON private_attachments
FOR EACH ROW
EXECUTE FUNCTION enqueue_private_attachment_object_deletion();
