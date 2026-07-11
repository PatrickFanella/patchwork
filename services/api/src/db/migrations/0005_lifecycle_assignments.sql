ALTER TABLE request_workflows
    ADD COLUMN IF NOT EXISTS assignment JSONB;

CREATE TABLE IF NOT EXISTS request_assignment_events (
    assignment_event_id BIGSERIAL PRIMARY KEY,
    command_id TEXT NOT NULL UNIQUE,
    post_uri TEXT NOT NULL REFERENCES request_workflows(post_uri) ON DELETE CASCADE,
    assigner_did TEXT NOT NULL,
    assignee_did TEXT NOT NULL,
    assignment JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_events_subject_created
    ON request_assignment_events (post_uri, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignment_events_assignee_created
    ON request_assignment_events (assignee_did, occurred_at DESC);
