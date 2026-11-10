-- Offers (#135) share the aid-post projection. Existing rows are requests.
ALTER TABLE indexer_aid_post_projections ADD COLUMN post_type TEXT NOT NULL DEFAULT 'request'
    CHECK (post_type IN ('request', 'offer'));
CREATE INDEX idx_aid_projection_post_type ON indexer_aid_post_projections (post_type, record_updated_at DESC, uri);
ALTER TABLE jetstream_v2_shadow.indexer_aid_post_projections ADD COLUMN post_type TEXT NOT NULL DEFAULT 'request'
    CHECK (post_type IN ('request', 'offer'));
