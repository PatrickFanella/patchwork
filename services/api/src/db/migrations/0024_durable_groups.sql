ALTER TABLE activity_inbox_items
    DROP CONSTRAINT IF EXISTS activity_inbox_items_item_type_check;
ALTER TABLE activity_inbox_items
    ADD CONSTRAINT activity_inbox_items_item_type_check CHECK (
        item_type IN (
            'request', 'offer', 'assignment', 'verification',
            'moderation', 'expiry', 'notification', 'outcome', 'scheduling',
            'group'
        )
    );

ALTER TABLE notification_intents
    DROP CONSTRAINT IF EXISTS notification_intents_notification_type_check;
ALTER TABLE notification_intents
    ADD CONSTRAINT notification_intents_notification_type_check CHECK (
        notification_type IN (
            'offer_received', 'offer_accepted', 'offer_declined',
            'offer_expired', 'connection_started',
            'connection_completed', 'connection_cancelled',
            'lifecycle_changed', 'verification_submitted',
            'verification_decided', 'appeal_submitted',
            'appeal_decided', 'account_expiry', 'moderation_action',
            'attachment_action', 'organization_action',
            'system_announcement', 'schedule_proposed',
            'schedule_changed', 'schedule_confirmed',
            'schedule_declined', 'schedule_cancelled',
            'schedule_reminder', 'schedule_expired',
            'group_invited', 'group_joined', 'group_removed',
            'group_role_changed', 'group_closed'
        )
    );

CREATE TABLE groups (
    group_id UUID PRIMARY KEY,
    owner_did TEXT NOT NULL,
    name TEXT NOT NULL CHECK (
        char_length(name) BETWEEN 1 AND 80 AND name !~ '[[:cntrl:]]'
    ),
    description TEXT NOT NULL CHECK (
        char_length(description) <= 1000 AND description !~ '[[:cntrl:]]'
    ),
    purpose TEXT NOT NULL CHECK (
        char_length(purpose) BETWEEN 1 AND 300 AND purpose !~ '[[:cntrl:]]'
    ),
    visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public')),
    status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    retention_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ
);

CREATE TABLE group_memberships (
    group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    member_did TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'moderator', 'member')),
    status TEXT NOT NULL CHECK (status IN ('active', 'left', 'removed')),
    joined_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (group_id, member_did)
);
CREATE UNIQUE INDEX idx_group_single_active_owner
    ON group_memberships (group_id)
    WHERE role = 'owner' AND status = 'active';
CREATE INDEX idx_group_memberships_actor
    ON group_memberships (member_did, status, group_id);

CREATE TABLE group_rooms (
    room_id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (
        char_length(name) BETWEEN 1 AND 80 AND name !~ '[[:cntrl:]]'
    ),
    linked_request_uri TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    retention_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    UNIQUE (group_id, name)
);
CREATE INDEX idx_group_rooms_group ON group_rooms (group_id, status, room_id);
CREATE UNIQUE INDEX idx_group_rooms_linked_request
    ON group_rooms (group_id, linked_request_uri)
    WHERE linked_request_uri IS NOT NULL;

CREATE TABLE group_invitations (
    invitation_id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    invitee_did TEXT NOT NULL,
    invited_by_did TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
    requested_role TEXT NOT NULL CHECK (requested_role IN ('moderator', 'member')),
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'accepted', 'rejected', 'revoked', 'expired')
    ),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    retention_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX idx_group_pending_invitee
    ON group_invitations (group_id, invitee_did)
    WHERE status = 'pending';
CREATE INDEX idx_group_invitations_expiry
    ON group_invitations (expires_at) WHERE status = 'pending';

CREATE TABLE group_audit_events (
    event_id BIGSERIAL PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    actor_did TEXT,
    subject_did TEXT,
    room_id UUID,
    action TEXT NOT NULL CHECK (
        action IN (
            'created', 'invited', 'invitation-accepted',
            'invitation-rejected', 'invitation-revoked', 'member-removed',
            'member-left', 'role-changed', 'ownership-transferred',
            'room-created', 'room-closed', 'group-closed'
        )
    ),
    occurred_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_group_audit_group ON group_audit_events (group_id, event_id);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON groups, group_memberships, group_rooms, group_invitations,
    group_audit_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE group_audit_events_event_id_seq FROM PUBLIC;
