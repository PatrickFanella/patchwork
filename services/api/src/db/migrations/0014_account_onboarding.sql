CREATE TABLE IF NOT EXISTS account_policy_consents (
    did TEXT NOT NULL CHECK (did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'),
    policy_version TEXT NOT NULL,
    asserted_18_or_older BOOLEAN NOT NULL CHECK (asserted_18_or_older),
    accepted_documents JSONB NOT NULL CHECK (
        jsonb_typeof(accepted_documents) = 'array'
        AND jsonb_array_length(accepted_documents) = 5
    ),
    accepted_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (did, policy_version)
);

CREATE TABLE IF NOT EXISTS account_preferences (
    did TEXT PRIMARY KEY CHECK (
        did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    privacy TEXT NOT NULL CHECK (
        privacy IN ('public', 'community', 'private')
    ),
    notifications JSONB NOT NULL CHECK (
        notifications ?& ARRAY['inApp', 'email', 'push']
        AND jsonb_typeof(notifications->'inApp') = 'boolean'
        AND jsonb_typeof(notifications->'email') = 'boolean'
        AND jsonb_typeof(notifications->'push') = 'boolean'
    ),
    visibility TEXT NOT NULL CHECK (
        visibility IN ('public', 'authenticated', 'hidden')
    ),
    language TEXT NOT NULL CHECK (language IN ('en', 'es')),
    location JSONB NOT NULL CHECK (
        location ?& ARRAY['sharing', 'noPermanentAddress']
        AND location->>'sharing' IN ('approximate', 'hidden')
        AND jsonb_typeof(location->'noPermanentAddress') = 'boolean'
    ),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS account_preference_audit (
    audit_id BIGSERIAL PRIMARY KEY,
    did TEXT NOT NULL,
    previous_value JSONB,
    next_value JSONB NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_preference_audit_did
    ON account_preference_audit (did, changed_at, audit_id);
