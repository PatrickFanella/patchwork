CREATE TABLE IF NOT EXISTS platform_maintenance_state (
    state_id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (state_id),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    reason_codes TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (
        reason_codes <@ ARRAY[
            'privacy', 'authorization', 'abuse', 'integrity',
            'moderation-backlog', 'monitoring', 'backup'
        ]::text[]
    ),
    public_message TEXT NOT NULL DEFAULT
        'Patchwork is operating normally.' CHECK (
            char_length(public_message) BETWEEN 1 AND 300
        ),
    activated_at TIMESTAMPTZ,
    activated_by_did TEXT,
    resumed_at TIMESTAMPTZ,
    resumed_by_did TEXT,
    version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (active AND cardinality(reason_codes) > 0
            AND activated_at IS NOT NULL
            AND activated_by_did IS NOT NULL)
        OR
        (NOT active AND cardinality(reason_codes) = 0)
    )
);

INSERT INTO platform_maintenance_state (
    state_id, active, reason_codes, public_message, version, updated_at
) VALUES (
    TRUE, FALSE, '{}'::text[], 'Patchwork is operating normally.', 0, NOW()
) ON CONFLICT (state_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_maintenance_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    actor_did TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('declare', 'resume')),
    reason_codes TEXT[] NOT NULL,
    public_message TEXT NOT NULL CHECK (
        char_length(public_message) BETWEEN 1 AND 300
    ),
    previous_active BOOLEAN NOT NULL,
    next_active BOOLEAN NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_maintenance_audit_occurred
    ON platform_maintenance_audit (occurred_at DESC, audit_id);

CREATE INDEX IF NOT EXISTS idx_platform_maintenance_audit_retention
    ON platform_maintenance_audit (retention_until, audit_id);
