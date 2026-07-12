CREATE INDEX IF NOT EXISTS idx_request_workflows_retention
    ON request_workflows (retention_until)
    WHERE retention_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_blocks_retention
    ON user_blocks (retention_until)
    WHERE retention_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operational_audit_retention
    ON operational_audit_events (retention_until);

CREATE INDEX IF NOT EXISTS idx_oauth_sessions_revoked
    ON at_oauth_sessions (revoked_at)
    WHERE revoked_at IS NOT NULL;
