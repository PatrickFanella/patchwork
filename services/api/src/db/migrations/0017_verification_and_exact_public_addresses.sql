CREATE TABLE IF NOT EXISTS private_attachments (
    attachment_id UUID PRIMARY KEY,
    owner_did TEXT NOT NULL CHECK (
        owner_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    purpose TEXT NOT NULL CHECK (
        purpose IN (
            'verification-evidence', 'aid-post', 'moderation-evidence'
        )
    ),
    object_key TEXT NOT NULL UNIQUE CHECK (
        object_key !~ '(^|/)\.\.(/|$)'
        AND object_key !~ '^/'
    ),
    declared_mime TEXT NOT NULL,
    detected_mime TEXT,
    byte_size BIGINT NOT NULL CHECK (
        byte_size >= 0 AND byte_size <= 10485760
    ),
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'clean', 'quarantined', 'deleted')
    ),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_private_attachments_owner
    ON private_attachments (owner_did, status, created_at);

CREATE TABLE IF NOT EXISTS verification_applications (
    application_id UUID PRIMARY KEY,
    applicant_did TEXT NOT NULL CHECK (
        applicant_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    subject_type TEXT NOT NULL CHECK (
        subject_type IN ('volunteer', 'organization', 'resource')
    ),
    organization_id UUID REFERENCES organizations(organization_id)
        ON DELETE CASCADE,
    subject_ref TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN (
            'pending', 'under-review', 'approved', 'denied',
            'revoked', 'expired'
        )
    ),
    submitted_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (
        (subject_type = 'organization' AND organization_id IS NOT NULL
         AND subject_ref = organization_id::text)
        OR
        (subject_type = 'resource' AND organization_id IS NOT NULL
         AND subject_ref ~ '^at://did:[^/]+/app\.patchwork\.directory\.resource/[^/]+$')
        OR
        (subject_type = 'volunteer' AND organization_id IS NULL
         AND subject_ref = applicant_did)
    )
);

CREATE INDEX IF NOT EXISTS idx_verification_applications_subject
    ON verification_applications (
        subject_type, subject_ref, status, expires_at, submitted_at
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_one_open_application
    ON verification_applications (applicant_did, subject_type, subject_ref)
    WHERE status IN ('pending', 'under-review');

CREATE TABLE IF NOT EXISTS verification_evidence_metadata (
    evidence_id UUID PRIMARY KEY,
    application_id UUID NOT NULL
        REFERENCES verification_applications(application_id)
        ON DELETE CASCADE,
    evidence_kind TEXT NOT NULL CHECK (
        evidence_kind IN (
            'identity', 'organization-registration', 'service-authorization',
            'community-reference', 'training', 'other'
        )
    ),
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
    issuer TEXT CHECK (issuer IS NULL OR char_length(issuer) <= 200),
    issued_at DATE,
    attachment_id UUID REFERENCES private_attachments(attachment_id)
        ON DELETE RESTRICT,
    private_notes TEXT CHECK (
        private_notes IS NULL OR char_length(private_notes) <= 2000
    ),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_evidence_application
    ON verification_evidence_metadata (application_id, created_at, evidence_id);

CREATE TABLE IF NOT EXISTS verification_decisions (
    decision_id UUID PRIMARY KEY,
    application_id UUID NOT NULL
        REFERENCES verification_applications(application_id)
        ON DELETE CASCADE,
    moderator_did TEXT NOT NULL,
    action TEXT NOT NULL CHECK (
        action IN ('approve', 'deny', 'revoke', 'renew')
    ),
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
    previous_status TEXT NOT NULL,
    next_status TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_decisions_application
    ON verification_decisions (application_id, decided_at, decision_id);

CREATE TABLE IF NOT EXISTS verification_appeals (
    appeal_id UUID PRIMARY KEY,
    application_id UUID NOT NULL
        REFERENCES verification_applications(application_id)
        ON DELETE CASCADE,
    applicant_did TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'under-review', 'upheld', 'denied')
    ),
    submitted_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by_did TEXT,
    resolution_note TEXT CHECK (
        resolution_note IS NULL OR char_length(resolution_note) <= 2000
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_one_open_appeal
    ON verification_appeals (application_id)
    WHERE status IN ('pending', 'under-review');

CREATE TABLE IF NOT EXISTS exact_public_address_requests (
    request_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(organization_id)
        ON DELETE CASCADE,
    resource_uri TEXT NOT NULL CHECK (
        resource_uri ~ '^at://did:[^/]+/app\.patchwork\.directory\.resource/[^/]+$'
    ),
    applicant_did TEXT NOT NULL,
    street_address TEXT NOT NULL CHECK (
        char_length(street_address) BETWEEN 1 AND 300
    ),
    latitude DOUBLE PRECISION NOT NULL CHECK (
        latitude BETWEEN -90 AND 90
    ),
    longitude DOUBLE PRECISION NOT NULL CHECK (
        longitude BETWEEN -180 AND 180
    ),
    confidential_facility BOOLEAN NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN (
            'pending', 'approved', 'rejected', 'quarantined',
            'revoked', 'expired'
        )
    ),
    requested_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    decided_by_did TEXT,
    decision_reason TEXT,
    approval_expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL
);

DROP INDEX IF EXISTS idx_exact_address_one_open_request;
CREATE UNIQUE INDEX idx_exact_address_one_open_request
    ON exact_public_address_requests (organization_id, resource_uri)
    WHERE status IN ('pending', 'approved', 'quarantined');

CREATE INDEX IF NOT EXISTS idx_exact_address_public_gate
    ON exact_public_address_requests (
        status, approval_expires_at, resource_uri
    );

CREATE TABLE IF NOT EXISTS verification_audit_events (
    audit_id BIGSERIAL PRIMARY KEY,
    actor_did TEXT,
    action TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    public_summary TEXT NOT NULL,
    private_details JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_audit_subject
    ON verification_audit_events (
        subject_type, subject_id, occurred_at, audit_id
    );
