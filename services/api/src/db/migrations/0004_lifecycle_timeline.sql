ALTER TABLE request_transition_events
    ADD COLUMN IF NOT EXISTS actor_role TEXT NOT NULL DEFAULT 'requester';

CREATE INDEX IF NOT EXISTS idx_transition_events_subject_timeline
    ON request_transition_events (post_uri, occurred_at ASC, transition_id ASC);
