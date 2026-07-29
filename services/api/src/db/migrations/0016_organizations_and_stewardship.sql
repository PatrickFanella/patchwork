CREATE TABLE IF NOT EXISTS organizations (
    organization_id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (
        slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
    description TEXT NOT NULL CHECK (char_length(description) <= 2000),
    origin TEXT NOT NULL CHECK (
        origin IN ('synthetic', 'sourced-public', 'visitor-created')
    ),
    source_url TEXT,
    source_retrieved_at TIMESTAMPTZ,
    source_last_verified_at TIMESTAMPTZ,
    non_endorsement_label TEXT NOT NULL,
    created_by_did TEXT NOT NULL CHECK (
        created_by_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (
        (
            origin = 'sourced-public'
            AND source_url IS NOT NULL
            AND source_retrieved_at IS NOT NULL
            AND source_last_verified_at IS NOT NULL
        )
        OR (
            origin <> 'sourced-public'
            AND source_url IS NULL
            AND source_retrieved_at IS NULL
            AND source_last_verified_at IS NULL
        )
    )
);

CREATE TABLE IF NOT EXISTS organization_memberships (
    organization_id UUID NOT NULL REFERENCES organizations(organization_id)
        ON DELETE CASCADE,
    member_did TEXT NOT NULL CHECK (
        member_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    role TEXT NOT NULL CHECK (
        role IN ('owner', 'admin', 'steward', 'member')
    ),
    status TEXT NOT NULL CHECK (status IN ('active', 'removed')),
    invited_by_did TEXT NOT NULL CHECK (
        invited_by_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    joined_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (organization_id, member_did)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_one_active_owner
    ON organization_memberships (organization_id)
    WHERE role = 'owner' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_organization_memberships_member
    ON organization_memberships (member_did, status, organization_id);

CREATE TABLE IF NOT EXISTS organization_invitations (
    invitation_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(organization_id)
        ON DELETE CASCADE,
    invitee_did TEXT NOT NULL CHECK (
        invitee_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    role TEXT NOT NULL CHECK (role IN ('admin', 'steward', 'member')),
    token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'accepted', 'revoked', 'expired')
    ),
    invited_by_did TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_organization_invitations_invitee
    ON organization_invitations (invitee_did, status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_one_pending_invitation
    ON organization_invitations (organization_id, invitee_did)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS organization_resource_stewardships (
    stewardship_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(organization_id)
        ON DELETE CASCADE,
    resource_uri TEXT NOT NULL CHECK (
        resource_uri ~ '^at://did:[^/]+/app\.patchwork\.directory\.resource/[^/]+$'
    ),
    steward_did TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('active', 'due', 'expired', 'revoked')
    ),
    last_reconfirmed_at TIMESTAMPTZ NOT NULL,
    reconfirm_due_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (organization_id, resource_uri)
);

CREATE INDEX IF NOT EXISTS idx_resource_stewardship_due
    ON organization_resource_stewardships (
        status, reconfirm_due_at, stewardship_id
    );

CREATE TABLE IF NOT EXISTS organization_audit_events (
    audit_id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(organization_id)
        ON DELETE CASCADE,
    actor_did TEXT,
    action TEXT NOT NULL,
    subject TEXT NOT NULL,
    details JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organization_audit_events_org
    ON organization_audit_events (organization_id, occurred_at, audit_id);

CREATE TABLE IF NOT EXISTS organization_notification_events (
    event_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(organization_id)
        ON DELETE CASCADE,
    recipient_did TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (
        event_type = 'resource-reconfirmation-due'
    ),
    stewardship_id UUID NOT NULL
        REFERENCES organization_resource_stewardships(stewardship_id)
        ON DELETE CASCADE,
    deduplication_key TEXT NOT NULL UNIQUE,
    payload JSONB NOT NULL CHECK (
        NOT (payload ? 'latitude')
        AND NOT (payload ? 'longitude')
        AND NOT (payload ? 'contactEmail')
        AND NOT (payload ? 'contactPhone')
    ),
    created_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);
