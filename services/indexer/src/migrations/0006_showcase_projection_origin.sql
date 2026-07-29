ALTER TABLE indexer_aid_post_projections
    ADD COLUMN IF NOT EXISTS record_origin TEXT NOT NULL
        DEFAULT 'visitor-created'
        CHECK (
            record_origin IN (
                'synthetic', 'sourced-public', 'visitor-created'
            )
        ),
    ADD COLUMN IF NOT EXISTS seed_version TEXT;

ALTER TABLE indexer_directory_resource_projections
    ADD COLUMN IF NOT EXISTS record_origin TEXT NOT NULL
        DEFAULT 'visitor-created'
        CHECK (
            record_origin IN (
                'synthetic', 'sourced-public', 'visitor-created'
            )
        ),
    ADD COLUMN IF NOT EXISTS seed_version TEXT;

ALTER TABLE indexer_volunteer_profile_projections
    ADD COLUMN IF NOT EXISTS record_origin TEXT NOT NULL
        DEFAULT 'visitor-created'
        CHECK (
            record_origin IN (
                'synthetic', 'sourced-public', 'visitor-created'
            )
        ),
    ADD COLUMN IF NOT EXISTS seed_version TEXT;

ALTER TABLE indexer_aid_post_projections
    ADD CONSTRAINT indexer_aid_seed_origin_consistency CHECK (
        (record_origin = 'synthetic' AND seed_version IS NOT NULL)
        OR (record_origin <> 'synthetic' AND seed_version IS NULL)
    );

ALTER TABLE indexer_directory_resource_projections
    ADD CONSTRAINT indexer_directory_seed_origin_consistency CHECK (
        (record_origin = 'synthetic' AND seed_version IS NOT NULL)
        OR (record_origin <> 'synthetic' AND seed_version IS NULL)
    );

ALTER TABLE indexer_volunteer_profile_projections
    ADD CONSTRAINT indexer_volunteer_seed_origin_consistency CHECK (
        (record_origin = 'synthetic' AND seed_version IS NOT NULL)
        OR (record_origin <> 'synthetic' AND seed_version IS NULL)
    );

CREATE INDEX IF NOT EXISTS idx_indexer_aid_origin
    ON indexer_aid_post_projections (record_origin, seed_version);
CREATE INDEX IF NOT EXISTS idx_indexer_directory_origin
    ON indexer_directory_resource_projections (record_origin, seed_version);
CREATE INDEX IF NOT EXISTS idx_indexer_volunteer_origin
    ON indexer_volunteer_profile_projections (record_origin, seed_version);
