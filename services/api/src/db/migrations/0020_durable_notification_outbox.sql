CREATE TABLE IF NOT EXISTS notification_intents (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_did TEXT NOT NULL CHECK (
        recipient_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    notification_type TEXT NOT NULL CHECK (
        notification_type IN (
            'offer_received', 'offer_accepted', 'offer_declined',
            'offer_expired', 'connection_started',
            'connection_completed', 'connection_cancelled',
            'lifecycle_changed', 'verification_submitted',
            'verification_decided', 'appeal_submitted',
            'appeal_decided', 'account_expiry', 'moderation_action',
            'attachment_action', 'organization_action',
            'system_announcement'
        )
    ),
    template_version TEXT NOT NULL CHECK (
        template_version ~ '^v[1-9][0-9]*$'
    ),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
    priority TEXT NOT NULL CHECK (
        priority IN ('low', 'normal', 'high', 'urgent')
    ),
    action_url TEXT NOT NULL CHECK (
        action_url ~ '^/[A-Za-z0-9/_?=&.%:-]*$'
    ),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(metadata) = 'object'
        AND metadata::text !~* '"(message|conversation|password|accessJwt|refreshJwt|access_token|refresh_token|exactLatitude|exactLongitude|latitude|longitude|streetAddress|contactEmail|contactPhone|privateNotes|reason|details)"[[:space:]]*:'
    ),
    deduplication_key TEXT NOT NULL CHECK (
        char_length(deduplication_key) BETWEEN 1 AND 500
    ),
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    channels_materialized_at TIMESTAMPTZ,
    retention_until TIMESTAMPTZ NOT NULL,
    UNIQUE (recipient_did, deduplication_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_intents_recipient
    ON notification_intents (
        recipient_did, archived_at, read_at, occurred_at DESC,
        notification_id
    );

CREATE INDEX IF NOT EXISTS idx_notification_intents_materialization
    ON notification_intents (created_at, notification_id)
    WHERE channels_materialized_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_email_endpoints (
    endpoint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_did TEXT NOT NULL CHECK (
        owner_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    email_address TEXT NOT NULL CHECK (
        char_length(email_address) BETWEEN 3 AND 320
        AND email_address ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
    verification_token_hash TEXT,
    verification_expires_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (owner_did),
    UNIQUE (email_address)
);

CREATE INDEX IF NOT EXISTS idx_notification_email_verified
    ON notification_email_endpoints (owner_did, verified_at)
    WHERE verified_at IS NOT NULL AND disabled_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_push_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_did TEXT NOT NULL CHECK (
        owner_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    endpoint TEXT NOT NULL CHECK (
        char_length(endpoint) BETWEEN 12 AND 2048
        AND endpoint ~ '^https://'
    ),
    p256dh TEXT NOT NULL CHECK (char_length(p256dh) BETWEEN 20 AND 200),
    auth_secret TEXT NOT NULL CHECK (
        char_length(auth_secret) BETWEEN 8 AND 200
    ),
    user_agent_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    invalid_reason_code TEXT,
    UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_notification_push_active
    ON notification_push_subscriptions (owner_did, created_at)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL
        REFERENCES notification_intents(notification_id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'push')),
    target_id UUID NOT NULL,
    provider_idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (
        status IN (
            'pending', 'processing', 'sent', 'delivered', 'retry',
            'dead-letter', 'skipped'
        )
    ),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (
        attempt_count BETWEEN 0 AND 10
    ),
    next_attempt_at TIMESTAMPTZ NOT NULL,
    locked_at TIMESTAMPTZ,
    provider_message_id TEXT,
    last_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    dead_lettered_at TIMESTAMPTZ,
    UNIQUE (notification_id, channel, target_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_pending
    ON notification_delivery_attempts (
        next_attempt_at, created_at, delivery_id
    )
    WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_notification_delivery_dead_letter
    ON notification_delivery_attempts (
        dead_lettered_at DESC, channel, notification_id
    )
    WHERE status = 'dead-letter';

CREATE OR REPLACE FUNCTION patchwork_enqueue_notification(
    recipient TEXT,
    notification_kind TEXT,
    notification_title TEXT,
    notification_body TEXT,
    notification_priority TEXT,
    notification_action_url TEXT,
    notification_metadata JSONB,
    notification_dedupe_key TEXT,
    notification_occurred_at TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    inserted_id UUID;
BEGIN
    IF recipient IS NULL OR recipient = '' THEN
        RETURN NULL;
    END IF;
    INSERT INTO notification_intents (
        recipient_did, notification_type, template_version, title, body,
        priority, action_url, metadata, deduplication_key, occurred_at,
        retention_until
    ) VALUES (
        recipient, notification_kind, 'v1', notification_title,
        notification_body, notification_priority, notification_action_url,
        COALESCE(notification_metadata, '{}'::jsonb),
        notification_dedupe_key, notification_occurred_at,
        notification_occurred_at + INTERVAL '1 year'
    )
    ON CONFLICT (recipient_did, deduplication_key) DO NOTHING
    RETURNING notification_id INTO inserted_id;
    RETURN inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION notify_coordination_offer_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    offer coordination_offers%ROWTYPE;
    recipient TEXT;
    kind TEXT;
    heading TEXT;
    summary TEXT;
BEGIN
    SELECT * INTO offer
      FROM coordination_offers
     WHERE offer_id = NEW.offer_id;
    IF NEW.action = 'offered' THEN
        recipient := offer.requester_did;
        kind := 'offer_received';
        heading := 'New offer';
        summary := 'Someone offered to help with your request.';
    ELSIF NEW.action = 'accepted' THEN
        PERFORM patchwork_enqueue_notification(
            offer.requester_did, 'connection_started',
            'Connection started',
            'Your mutual-aid connection is ready for coordination.',
            'normal', '/inbox',
            jsonb_build_object('offerId', NEW.offer_id),
            'coordination-event:' || NEW.event_id::text || ':connection',
            NEW.occurred_at
        );
        recipient := offer.offerer_did;
        kind := 'offer_accepted';
        heading := 'Offer accepted';
        summary := 'Your offer was accepted. Open coordination for next steps.';
    ELSIF NEW.action = 'declined' THEN
        recipient := offer.offerer_did;
        kind := 'offer_declined';
        heading := 'Offer declined';
        summary := 'Your offer was declined.';
    ELSIF NEW.action = 'expired' THEN
        recipient := offer.offerer_did;
        kind := 'offer_expired';
        heading := 'Offer expired';
        summary := 'Your offer expired before it was accepted.';
    ELSIF NEW.action = 'connection-completed' THEN
        recipient := CASE
            WHEN NEW.actor_did = offer.requester_did
                THEN offer.offerer_did
            ELSE offer.requester_did
        END;
        kind := 'connection_completed';
        heading := 'Handoff completed';
        summary := 'The mutual-aid handoff was marked complete.';
    ELSIF NEW.action IN ('connection-cancelled', 'connection-expired') THEN
        recipient := CASE
            WHEN NEW.actor_did = offer.requester_did
                THEN offer.offerer_did
            ELSE offer.requester_did
        END;
        kind := 'connection_cancelled';
        heading := 'Connection closed';
        summary := 'The mutual-aid connection is no longer active.';
    ELSE
        RETURN NEW;
    END IF;
    PERFORM patchwork_enqueue_notification(
        recipient, kind, heading, summary, 'normal', '/inbox',
        jsonb_build_object('offerId', NEW.offer_id),
        'coordination-event:' || NEW.event_id::text, NEW.occurred_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_coordination_offer_event
    ON coordination_offer_events;
CREATE TRIGGER trg_notify_coordination_offer_event
AFTER INSERT ON coordination_offer_events
FOR EACH ROW EXECUTE FUNCTION notify_coordination_offer_event();

CREATE OR REPLACE FUNCTION notify_request_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    owner_did TEXT;
BEGIN
    SELECT requester_did INTO owner_did
      FROM request_workflows
     WHERE post_uri = NEW.post_uri;
    PERFORM patchwork_enqueue_notification(
        owner_did, 'lifecycle_changed', 'Request status updated',
        'Your request moved to a new lifecycle state.', 'normal', '/inbox',
        jsonb_build_object(
            'postUri', NEW.post_uri,
            'status', NEW.to_status
        ),
        'request-transition:' || NEW.transition_id::text, NEW.occurred_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_transition
    ON request_transition_events;
CREATE TRIGGER trg_notify_request_transition
AFTER INSERT ON request_transition_events
FOR EACH ROW EXECUTE FUNCTION notify_request_transition();

CREATE OR REPLACE FUNCTION notify_verification_application_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    kind TEXT;
    heading TEXT;
    summary TEXT;
    urgency TEXT := 'normal';
BEGIN
    IF TG_OP = 'INSERT' THEN
        kind := 'verification_submitted';
        heading := 'Verification submitted';
        summary := 'Your private verification application was received.';
    ELSIF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    ELSIF NEW.status = 'expired' THEN
        kind := 'account_expiry';
        heading := 'Verification expired';
        summary := 'Your verification expired and may be renewed.';
        urgency := 'high';
    ELSE
        kind := 'verification_decided';
        heading := 'Verification updated';
        summary := 'A moderator updated your verification application.';
    END IF;
    PERFORM patchwork_enqueue_notification(
        NEW.applicant_did, kind, heading, summary, urgency, '/verification',
        jsonb_build_object(
            'applicationId', NEW.application_id,
            'status', NEW.status
        ),
        'verification:' || NEW.application_id::text || ':' || NEW.status,
        NEW.updated_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_verification_application
    ON verification_applications;
CREATE TRIGGER trg_notify_verification_application
AFTER INSERT OR UPDATE OF status ON verification_applications
FOR EACH ROW EXECUTE FUNCTION notify_verification_application_change();

CREATE OR REPLACE FUNCTION notify_verification_appeal_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    heading TEXT;
    summary TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;
    IF NEW.status IN ('pending', 'under-review') THEN
        heading := 'Appeal received';
        summary := 'Your verification appeal is awaiting review.';
    ELSE
        heading := 'Appeal decided';
        summary := 'A moderator resolved your verification appeal.';
    END IF;
    PERFORM patchwork_enqueue_notification(
        NEW.applicant_did,
        CASE
            WHEN NEW.status IN ('pending', 'under-review')
                THEN 'appeal_submitted'
            ELSE 'appeal_decided'
        END,
        heading, summary, 'normal', '/verification',
        jsonb_build_object(
            'appealId', NEW.appeal_id,
            'applicationId', NEW.application_id,
            'status', NEW.status
        ),
        'appeal:' || NEW.appeal_id::text || ':' || NEW.status,
        COALESCE(NEW.resolved_at, NEW.submitted_at)
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_verification_appeal
    ON verification_appeals;
CREATE TRIGGER trg_notify_verification_appeal
AFTER INSERT OR UPDATE OF status ON verification_appeals
FOR EACH ROW EXECUTE FUNCTION notify_verification_appeal_change();

CREATE OR REPLACE FUNCTION notify_report_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;
    PERFORM patchwork_enqueue_notification(
        NEW.reporter_did, 'moderation_action', 'Report status updated',
        'A moderator updated the status of your report.', 'normal',
        '/notifications',
        jsonb_build_object(
            'reportId', NEW.report_id,
            'status', NEW.status
        ),
        'report:' || NEW.report_id::text || ':' || NEW.status,
        NOW()
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_report_status ON abuse_reports;
CREATE TRIGGER trg_notify_report_status
AFTER UPDATE OF status ON abuse_reports
FOR EACH ROW EXECUTE FUNCTION notify_report_status_change();

CREATE OR REPLACE FUNCTION notify_attachment_moderator_action()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    owner TEXT;
BEGIN
    SELECT owner_did INTO owner
      FROM private_attachments
     WHERE attachment_id = NEW.attachment_id;
    PERFORM patchwork_enqueue_notification(
        owner, 'attachment_action', 'Private attachment reviewed',
        'A moderator updated one of your private attachments.', 'high',
        '/notifications',
        jsonb_build_object(
            'attachmentId', NEW.attachment_id,
            'action', NEW.action
        ),
        'attachment-action:' || NEW.action_id::text, NEW.acted_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_attachment_moderator_action
    ON attachment_moderator_actions;
CREATE TRIGGER trg_notify_attachment_moderator_action
AFTER INSERT ON attachment_moderator_actions
FOR EACH ROW EXECUTE FUNCTION notify_attachment_moderator_action();

CREATE OR REPLACE FUNCTION notify_organization_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM patchwork_enqueue_notification(
        NEW.recipient_did, 'organization_action',
        'Resource reconfirmation due',
        'A stewarded resource requires reconfirmation.', 'high',
        '/organizations',
        jsonb_build_object(
            'organizationId', NEW.organization_id,
            'stewardshipId', NEW.stewardship_id
        ),
        NEW.deduplication_key, NEW.created_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_organization_event
    ON organization_notification_events;
CREATE TRIGGER trg_notify_organization_event
AFTER INSERT ON organization_notification_events
FOR EACH ROW EXECUTE FUNCTION notify_organization_event();
