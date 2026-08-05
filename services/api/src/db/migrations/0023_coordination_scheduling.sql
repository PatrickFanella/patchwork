ALTER TABLE activity_inbox_items
    DROP CONSTRAINT IF EXISTS activity_inbox_items_item_type_check;
ALTER TABLE activity_inbox_items
    ADD CONSTRAINT activity_inbox_items_item_type_check CHECK (
        item_type IN (
            'request', 'offer', 'assignment', 'verification',
            'moderation', 'expiry', 'notification', 'outcome', 'scheduling'
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
            'schedule_reminder', 'schedule_expired'
        )
    );

CREATE TABLE coordination_windows (
    window_id UUID PRIMARY KEY,
    connection_id UUID NOT NULL
        REFERENCES coordination_connections(connection_id) ON DELETE CASCADE,
    proposer_did TEXT NOT NULL,
    recipient_did TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    originating_timezone TEXT NOT NULL CHECK (
        char_length(originating_timezone) BETWEEN 1 AND 100
        AND originating_timezone !~ '[[:cntrl:]]'
    ),
    status TEXT NOT NULL CHECK (
        status IN ('proposed', 'confirmed', 'declined', 'cancelled', 'expired')
    ),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    proposal_expires_at TIMESTAMPTZ NOT NULL,
    reminder_eligible_at TIMESTAMPTZ NOT NULL,
    reminder_sent_at TIMESTAMPTZ,
    retention_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (proposer_did <> recipient_did),
    CHECK (start_at < end_at),
    CHECK (proposal_expires_at <= start_at),
    UNIQUE (connection_id)
);

CREATE INDEX idx_coordination_windows_participants
    ON coordination_windows (proposer_did, recipient_did, status, start_at);
CREATE INDEX idx_coordination_windows_expiry
    ON coordination_windows (proposal_expires_at)
    WHERE status = 'proposed';
CREATE INDEX idx_coordination_windows_reminders
    ON coordination_windows (reminder_eligible_at)
    WHERE status = 'confirmed' AND reminder_sent_at IS NULL;
CREATE INDEX idx_coordination_windows_retention
    ON coordination_windows (retention_until);

CREATE TABLE coordination_window_events (
    event_id BIGSERIAL PRIMARY KEY,
    window_id UUID NOT NULL
        REFERENCES coordination_windows(window_id) ON DELETE CASCADE,
    actor_did TEXT,
    action TEXT NOT NULL CHECK (
        action IN (
            'proposed', 'counter-proposed', 'confirmed', 'declined',
            'cancelled', 'expired', 'reminder-eligible'
        )
    ),
    previous_status TEXT,
    next_status TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    occurred_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_coordination_window_events_window
    ON coordination_window_events (window_id, event_id);

ALTER TABLE coordination_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordination_window_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON coordination_windows, coordination_window_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE coordination_window_events_event_id_seq FROM PUBLIC;
