CREATE TABLE IF NOT EXISTS request_workflows (
    post_uri TEXT PRIMARY KEY,
    requester_did TEXT NOT NULL,
    current_status TEXT NOT NULL CHECK (
        current_status IN ('open', 'triaged', 'assigned', 'in_progress', 'resolved', 'archived')
    ),
    create_command_id TEXT NOT NULL UNIQUE,
    retention_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS request_transition_events (
    transition_id BIGSERIAL PRIMARY KEY,
    command_id TEXT NOT NULL UNIQUE,
    post_uri TEXT NOT NULL REFERENCES request_workflows(post_uri) ON DELETE CASCADE,
    actor_did TEXT NOT NULL,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_blocks (
    block_id BIGSERIAL PRIMARY KEY,
    command_id TEXT NOT NULL UNIQUE,
    blocker_did TEXT NOT NULL,
    subject_did TEXT NOT NULL,
    reason TEXT,
    retention_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    CHECK (blocker_did <> subject_did)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_blocks_active_pair
    ON user_blocks (blocker_did, subject_did)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS abuse_reports (
    report_id BIGSERIAL PRIMARY KEY,
    command_id TEXT NOT NULL UNIQUE,
    reporter_did TEXT NOT NULL,
    subject_uri TEXT NOT NULL,
    subject_did TEXT,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'reviewing', 'resolved', 'dismissed')
    ),
    retention_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS operational_audit_events (
    audit_event_id BIGSERIAL PRIMARY KEY,
    command_id TEXT NOT NULL UNIQUE,
    actor_did TEXT,
    action TEXT NOT NULL,
    subject_uri TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(payload) = 'object'
        AND NOT payload ?| ARRAY[
            'password', 'accessJwt', 'refreshJwt', 'access_token',
            'refresh_token', 'exactLatitude', 'exactLongitude'
        ]
    ),
    retention_until TIMESTAMPTZ NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_workflows_status_created
    ON request_workflows (current_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transition_events_actor_created
    ON request_transition_events (actor_did, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transition_events_subject_created
    ON request_transition_events (post_uri, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_created
    ON user_blocks (blocker_did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_blocks_subject_created
    ON user_blocks (subject_did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_reporter_created
    ON abuse_reports (reporter_did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_subject_status
    ON abuse_reports (subject_uri, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_audit_actor_created
    ON operational_audit_events (actor_did, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_audit_subject_created
    ON operational_audit_events (subject_uri, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_retention
    ON abuse_reports (retention_until)
    WHERE deleted_at IS NULL;
