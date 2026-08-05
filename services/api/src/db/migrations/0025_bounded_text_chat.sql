ALTER TABLE activity_inbox_items
    DROP CONSTRAINT IF EXISTS activity_inbox_items_item_type_check;
ALTER TABLE activity_inbox_items
    ADD CONSTRAINT activity_inbox_items_item_type_check CHECK (
        item_type IN (
            'request', 'offer', 'assignment', 'verification',
            'moderation', 'expiry', 'notification', 'outcome', 'scheduling',
            'group', 'chat'
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
            'group_role_changed', 'group_closed', 'message_received'
        )
    );

CREATE TABLE chat_conversations (
    conversation_id UUID PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
    connection_id UUID REFERENCES coordination_connections(connection_id)
        ON DELETE CASCADE,
    room_id UUID REFERENCES group_rooms(room_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    retention_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    CHECK (
        (kind='direct' AND connection_id IS NOT NULL AND room_id IS NULL)
        OR (kind='group' AND room_id IS NOT NULL AND connection_id IS NULL)
    )
);
CREATE UNIQUE INDEX idx_chat_direct_scope ON chat_conversations (connection_id)
    WHERE connection_id IS NOT NULL;
CREATE UNIQUE INDEX idx_chat_group_scope ON chat_conversations (room_id)
    WHERE room_id IS NOT NULL;

CREATE TABLE chat_participant_state (
    conversation_id UUID NOT NULL
        REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
    participant_did TEXT NOT NULL,
    last_read_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_read_sequence >= 0),
    joined_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (conversation_id, participant_did)
);
CREATE INDEX idx_chat_participant_actor
    ON chat_participant_state (participant_did, updated_at DESC);

CREATE TABLE chat_messages (
    message_id UUID PRIMARY KEY,
    sequence BIGSERIAL UNIQUE,
    conversation_id UUID NOT NULL
        REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
    author_did TEXT,
    body TEXT CHECK (
        body IS NULL OR (char_length(body) BETWEEN 1 AND 2000)
    ),
    status TEXT NOT NULL CHECK (status IN ('active', 'redacted')),
    client_message_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    redacted_at TIMESTAMPTZ,
    retention_until TIMESTAMPTZ NOT NULL,
    UNIQUE (conversation_id, author_did, client_message_id),
    CHECK (
        (status='active' AND body IS NOT NULL AND author_did IS NOT NULL)
        OR (status='redacted' AND body IS NULL)
    )
);
CREATE INDEX idx_chat_messages_page
    ON chat_messages (conversation_id, sequence DESC);
CREATE INDEX idx_chat_messages_author_rate
    ON chat_messages (author_did, created_at DESC) WHERE status='active';
CREATE INDEX idx_chat_messages_retention ON chat_messages (retention_until);

CREATE TABLE chat_message_receipts (
    message_id UUID NOT NULL REFERENCES chat_messages(message_id) ON DELETE CASCADE,
    recipient_did TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('delivered', 'read')),
    delivered_at TIMESTAMPTZ NOT NULL,
    read_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (message_id, recipient_did)
);
CREATE INDEX idx_chat_receipts_recipient
    ON chat_message_receipts (recipient_did, state, updated_at DESC);

CREATE TABLE chat_audit_events (
    event_id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL
        REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
    message_id UUID,
    actor_did TEXT,
    action TEXT NOT NULL CHECK (action IN (
        'conversation-created', 'message-sent', 'messages-read',
        'message-redacted', 'message-reported', 'conversation-closed'
    )),
    occurred_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_chat_audit_conversation
    ON chat_audit_events (conversation_id, event_id);

CREATE TABLE chat_abuse_report_evidence (
    report_id BIGINT PRIMARY KEY REFERENCES abuse_reports(report_id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL
        REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES chat_messages(message_id) ON DELETE CASCADE,
    message_author_did TEXT,
    body_sha256 TEXT NOT NULL CHECK (char_length(body_sha256)=64),
    body_character_count INTEGER NOT NULL CHECK (
        body_character_count BETWEEN 0 AND 2000
    ),
    message_created_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participant_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_abuse_report_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chat_conversations,chat_participant_state,chat_messages,
    chat_message_receipts,chat_audit_events,chat_abuse_report_evidence FROM PUBLIC;
REVOKE ALL ON SEQUENCE chat_messages_sequence_seq,chat_audit_events_event_id_seq
    FROM PUBLIC;
