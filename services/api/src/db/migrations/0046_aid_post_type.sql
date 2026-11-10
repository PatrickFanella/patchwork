-- Offers (#135) reuse request workflows: the post author accepts one responder.
-- The column tells coordination which copy and checks apply. Existing rows are requests.
ALTER TABLE request_workflows ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'request'
    CHECK (post_type IN ('request', 'offer'));
