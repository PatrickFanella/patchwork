CREATE TABLE IF NOT EXISTS showcase_record_metadata (
    entity_type TEXT NOT NULL CHECK (
        entity_type IN (
            'person', 'aid-post', 'directory-resource',
            'volunteer-profile', 'request-workflow', 'lifecycle-event',
            'coordination-offer', 'coordination-connection', 'outcome',
            'organization', 'moderation-case', 'notification'
        )
    ),
    entity_key TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (
        origin IN ('synthetic', 'sourced-public', 'visitor-created')
    ),
    seed_version TEXT,
    source_name TEXT,
    source_url TEXT,
    source_retrieved_at TIMESTAMPTZ,
    source_last_verified_at TIMESTAMPTZ,
    non_participation_disclosure BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (entity_type, entity_key),
    CHECK (
        (
            origin = 'synthetic'
            AND seed_version IS NOT NULL
            AND source_name IS NULL
            AND source_url IS NULL
            AND source_retrieved_at IS NULL
            AND source_last_verified_at IS NULL
            AND non_participation_disclosure = FALSE
        )
        OR (
            origin = 'sourced-public'
            AND seed_version IS NOT NULL
            AND source_name IS NOT NULL
            AND source_url ~ '^https://'
            AND source_retrieved_at IS NOT NULL
            AND source_last_verified_at IS NOT NULL
            AND non_participation_disclosure = TRUE
        )
        OR (
            origin = 'visitor-created'
            AND seed_version IS NULL
            AND source_name IS NULL
            AND source_url IS NULL
            AND source_retrieved_at IS NULL
            AND source_last_verified_at IS NULL
            AND non_participation_disclosure = FALSE
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_showcase_record_metadata_origin
    ON showcase_record_metadata (origin, seed_version, entity_type);

CREATE TABLE IF NOT EXISTS showcase_seed_runs (
    seed_version TEXT PRIMARY KEY,
    manifest_sha256 TEXT NOT NULL CHECK (
        manifest_sha256 ~ '^[a-f0-9]{64}$'
    ),
    applied_at TIMESTAMPTZ NOT NULL,
    record_count INTEGER NOT NULL CHECK (record_count > 0)
);

CREATE OR REPLACE FUNCTION prevent_showcase_origin_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.entity_type <> OLD.entity_type
       OR NEW.entity_key <> OLD.entity_key
       OR NEW.origin <> OLD.origin THEN
        RAISE EXCEPTION 'showcase record origin metadata is immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_showcase_origin_immutable
    ON showcase_record_metadata;
CREATE TRIGGER trg_showcase_origin_immutable
BEFORE UPDATE ON showcase_record_metadata
FOR EACH ROW EXECUTE FUNCTION prevent_showcase_origin_change();
