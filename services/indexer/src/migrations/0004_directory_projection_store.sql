CREATE TABLE IF NOT EXISTS indexer_directory_resource_projections (
    uri TEXT PRIMARY KEY,
    collection TEXT NOT NULL,
    cid TEXT,
    revision TEXT,
    author_did_hash TEXT NOT NULL CHECK (author_did_hash ~ '^[a-f0-9]{64}$'),
    name TEXT NOT NULL,
    service_area TEXT NOT NULL,
    category TEXT NOT NULL CHECK (
        category IN ('food-bank', 'shelter', 'clinic', 'legal-aid', 'hotline', 'other')
    ),
    verification_status TEXT NOT NULL CHECK (
        verification_status IN (
            'unverified', 'community-verified', 'partner-verified'
        )
    ),
    contact JSONB NOT NULL CHECK (
        jsonb_typeof(contact) = 'object'
        AND (contact ? 'url' OR contact ? 'phone')
        AND (NOT contact ? 'url' OR jsonb_typeof(contact -> 'url') = 'string')
        AND (NOT contact ? 'phone' OR jsonb_typeof(contact -> 'phone') = 'string')
    ),
    searchable_text TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    precision_km DOUBLE PRECISION CHECK (
        precision_km IS NULL OR precision_km >= 1
    ),
    open_hours TEXT,
    eligibility_notes TEXT,
    operational_status TEXT NOT NULL CHECK (
        operational_status IN ('open', 'limited', 'closed')
    ),
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

CREATE INDEX IF NOT EXISTS idx_indexer_directory_resource_discovery
    ON indexer_directory_resource_projections (
        operational_status, category, verification_status,
        record_updated_at DESC, uri
    );

CREATE INDEX IF NOT EXISTS idx_indexer_directory_resource_cursor
    ON indexer_directory_resource_projections (source_cursor);
