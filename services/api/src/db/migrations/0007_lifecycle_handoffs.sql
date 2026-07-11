ALTER TABLE request_workflows
    ADD COLUMN IF NOT EXISTS handoff JSONB;

CREATE TABLE IF NOT EXISTS request_handoff_events (
    handoff_event_id BIGSERIAL PRIMARY KEY,
    command_id TEXT NOT NULL UNIQUE,
    post_uri TEXT NOT NULL REFERENCES request_workflows(post_uri) ON DELETE CASCADE,
    completed_by TEXT NOT NULL,
    handoff JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_events_subject_created
    ON request_handoff_events (post_uri, occurred_at DESC);
