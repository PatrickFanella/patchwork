CREATE TABLE IF NOT EXISTS coordination_offers (
    offer_id UUID PRIMARY KEY,
    request_uri TEXT NOT NULL
        REFERENCES request_workflows(post_uri) ON DELETE CASCADE,
    requester_did TEXT NOT NULL,
    offerer_did TEXT NOT NULL,
    note TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
    status TEXT NOT NULL CHECK (
        status IN (
            'pending', 'accepted', 'declined', 'expired', 'cancelled'
        )
    ),
    offered_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (requester_did <> offerer_did)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coordination_offer_open_pair
    ON coordination_offers (request_uri, offerer_did)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_coordination_offers_participants
    ON coordination_offers (
        requester_did, offerer_did, status, updated_at DESC
    );

CREATE TABLE IF NOT EXISTS coordination_connections (
    connection_id UUID PRIMARY KEY,
    offer_id UUID NOT NULL UNIQUE
        REFERENCES coordination_offers(offer_id) ON DELETE CASCADE,
    request_uri TEXT NOT NULL
        REFERENCES request_workflows(post_uri) ON DELETE CASCADE,
    requester_did TEXT NOT NULL,
    helper_did TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('active', 'completed', 'cancelled', 'expired')
    ),
    accepted_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (requester_did <> helper_did)
);

CREATE INDEX IF NOT EXISTS idx_coordination_connections_participants
    ON coordination_connections (
        requester_did, helper_did, status, updated_at DESC
    );

CREATE TABLE IF NOT EXISTS coordination_offer_events (
    event_id BIGSERIAL PRIMARY KEY,
    offer_id UUID NOT NULL
        REFERENCES coordination_offers(offer_id) ON DELETE CASCADE,
    connection_id UUID REFERENCES coordination_connections(connection_id)
        ON DELETE SET NULL,
    actor_did TEXT,
    action TEXT NOT NULL CHECK (
        action IN (
            'offered', 'accepted', 'declined', 'expired', 'cancelled',
            'connection-completed', 'connection-cancelled',
            'connection-expired'
        )
    ),
    previous_status TEXT,
    next_status TEXT NOT NULL,
    public_summary TEXT NOT NULL,
    private_details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(private_details) = 'object'
        AND NOT private_details ?| ARRAY[
            'password', 'accessJwt', 'refreshJwt', 'access_token',
            'refresh_token', 'exactLatitude', 'exactLongitude'
        ]
    ),
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coordination_offer_events
    ON coordination_offer_events (offer_id, occurred_at, event_id);

CREATE TABLE IF NOT EXISTS activity_inbox_items (
    item_id UUID PRIMARY KEY,
    recipient_did TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (
        item_type IN (
            'request', 'offer', 'assignment', 'verification',
            'moderation', 'expiry', 'notification', 'outcome'
        )
    ),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    summary TEXT NOT NULL CHECK (char_length(summary) <= 500),
    action_url TEXT NOT NULL CHECK (
        action_url ~ '^/[A-Za-z0-9/_?=&.%:-]*$'
    ),
    source_key TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(metadata) = 'object'
        AND NOT metadata ?| ARRAY[
            'message', 'conversation', 'password', 'accessJwt', 'refreshJwt',
            'access_token', 'refresh_token', 'exactLatitude',
            'exactLongitude', 'streetAddress'
        ]
    ),
    occurred_at TIMESTAMPTZ NOT NULL,
    read_at TIMESTAMPTZ,
    retention_until TIMESTAMPTZ NOT NULL,
    UNIQUE (recipient_did, source_key)
);

CREATE INDEX IF NOT EXISTS idx_activity_inbox_recipient
    ON activity_inbox_items (
        recipient_did, read_at, occurred_at DESC, item_id
    );

CREATE TABLE IF NOT EXISTS coordination_outcome_feedback (
    feedback_id UUID PRIMARY KEY,
    connection_id UUID NOT NULL
        REFERENCES coordination_connections(connection_id) ON DELETE CASCADE,
    request_uri TEXT NOT NULL,
    submitter_did TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (
        outcome IN (
            'successful', 'partially-successful', 'unsuccessful',
            'no-response', 'cancelled'
        )
    ),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT CHECK (
        comment IS NULL OR char_length(comment) <= 2000
    ),
    tags JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
        jsonb_typeof(tags) = 'array' AND jsonb_array_length(tags) <= 10
    ),
    submitted_at TIMESTAMPTZ NOT NULL,
    retention_until TIMESTAMPTZ NOT NULL,
    UNIQUE (connection_id, submitter_did)
);

CREATE INDEX IF NOT EXISTS idx_coordination_outcome_submitter
    ON coordination_outcome_feedback (
        submitter_did, submitted_at DESC, feedback_id
    );
