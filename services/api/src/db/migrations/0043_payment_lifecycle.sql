-- Payment lifecycle: Stripe commands queued by account deactivation,
-- moderator redaction after deactivation, and donor notifications.

-- Stripe calls cannot run inside the deactivation transaction, so
-- deactivation queues them here and a sweep sends them with retries.
CREATE TABLE IF NOT EXISTS payment_commands (
    command_id UUID PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('cancel-at-period-end')),
    subscription_id UUID NOT NULL REFERENCES supporter_subscriptions(subscription_id),
    status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'dead-letter')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL,
    last_error_code TEXT CHECK (
        last_error_code IS NULL OR last_error_code ~ '^[A-Z0-9_]{1,80}$'
    ),
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    UNIQUE (kind, subscription_id),
    CHECK ((status = 'done') = (completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_payment_commands_due
    ON payment_commands (next_attempt_at, created_at)
    WHERE status = 'pending';

-- A deactivated moderator's DID is replaced with a hashed marker, as in
-- verification decisions.
DO $$
DECLARE existing TEXT;
BEGIN
    SELECT conname INTO existing FROM pg_constraint
     WHERE conrelid = 'payment_recipients'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%suspended_by_did ~%';
    IF existing IS NOT NULL THEN
        EXECUTE format('ALTER TABLE payment_recipients DROP CONSTRAINT %I', existing);
    END IF;
END $$;
ALTER TABLE payment_recipients
    ADD CONSTRAINT payment_recipients_suspended_by CHECK (
        suspended_by_did IS NULL
        OR suspended_by_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
        OR suspended_by_did ~ '^deactivated:[0-9a-f]{64}$'
    );

CREATE INDEX IF NOT EXISTS idx_payment_audit_events_actor
    ON payment_audit_events (actor_did) WHERE actor_did IS NOT NULL;

-- Extend the notification type check without repeating its list.
DO $$
DECLARE previous TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO previous FROM pg_constraint
        WHERE conrelid='notification_intents'::regclass
          AND conname='notification_intents_notification_type_check';
    ALTER TABLE notification_intents DROP CONSTRAINT notification_intents_notification_type_check;
    EXECUTE 'ALTER TABLE notification_intents ADD CONSTRAINT notification_intents_notification_type_check CHECK ('
        || substring(previous FROM 8 FOR char_length(previous)-8)
        || ' OR notification_type IN (''support_receipt'',''support_payment_failed'','
        || '''support_subscription_ending'',''support_recipient_paused''))';
END $$;
