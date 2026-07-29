CREATE TABLE IF NOT EXISTS indexer_volunteer_profile_projections (
    uri TEXT PRIMARY KEY,
    collection TEXT NOT NULL CHECK (
        collection = 'app.patchwork.volunteer.profile'
    ),
    cid TEXT,
    revision TEXT,
    author_did_hash TEXT NOT NULL CHECK (
        author_did_hash ~ '^[a-f0-9]{64}$'
    ),
    display_name TEXT NOT NULL,
    bio TEXT,
    capabilities JSONB NOT NULL CHECK (
        jsonb_typeof(capabilities) = 'array'
    ),
    availability TEXT NOT NULL CHECK (
        availability IN (
            'immediate', 'within-24h', 'scheduled', 'unavailable'
        )
    ),
    contact_preference TEXT NOT NULL CHECK (
        contact_preference IN ('chat-only', 'chat-or-call')
    ),
    skills JSONB NOT NULL CHECK (jsonb_typeof(skills) = 'array'),
    languages JSONB NOT NULL CHECK (jsonb_typeof(languages) = 'array'),
    service_area_label TEXT,
    no_permanent_address BOOLEAN NOT NULL DEFAULT FALSE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    precision_km DOUBLE PRECISION CHECK (
        precision_km IS NULL OR precision_km >= 1
    ),
    searchable_text TEXT NOT NULL,
    record_created_at TIMESTAMPTZ NOT NULL,
    record_updated_at TIMESTAMPTZ NOT NULL,
    source_cursor BIGINT NOT NULL,
    source_event_id TEXT NOT NULL,
    projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (latitude IS NULL AND longitude IS NULL AND precision_km IS NULL)
        OR
        (latitude IS NOT NULL AND longitude IS NOT NULL AND precision_km IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_volunteer_profile_discovery
    ON indexer_volunteer_profile_projections (
        availability, record_updated_at DESC, uri
    );

CREATE INDEX IF NOT EXISTS idx_volunteer_profile_cursor
    ON indexer_volunteer_profile_projections (source_cursor);
