-- Donations and supporter tiers. Payment records outlive organizations and
-- donor accounts for accounting retention, so references to them are
-- nullable and never cascade a delete into financial history.

CREATE TABLE IF NOT EXISTS payment_recipients (
    recipient_id UUID PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('general-fund', 'organization')),
    organization_id UUID UNIQUE REFERENCES organizations(organization_id)
        ON DELETE SET NULL,
    display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 160),
    stripe_account_id TEXT UNIQUE CHECK (
        stripe_account_id IS NULL OR stripe_account_id ~ '^acct_[A-Za-z0-9]{1,255}$'
    ),
    charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL CHECK (
        status IN ('onboarding', 'active', 'suspended', 'closed')
    ),
    suspension_reason TEXT CHECK (
        suspension_reason IS NULL OR char_length(suspension_reason) BETWEEN 1 AND 2000
    ),
    suspended_by_did TEXT CHECK (
        suspended_by_did IS NULL
        OR suspended_by_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    account_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (
        (kind = 'general-fund' AND organization_id IS NULL
         AND stripe_account_id IS NULL)
        OR (kind = 'organization'
            AND (organization_id IS NOT NULL OR status = 'closed'))
    ),
    CHECK (
        (status = 'suspended' AND suspension_reason IS NOT NULL
         AND suspended_by_did IS NOT NULL)
        OR status <> 'suspended'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_recipients_one_general_fund
    ON payment_recipients (kind) WHERE kind = 'general-fund';

INSERT INTO payment_recipients (
    recipient_id, kind, display_name, status, created_at, updated_at
) VALUES (
    '00000000-0000-4000-8000-000000000001', 'general-fund',
    'Patchwork general fund', 'active', NOW(), NOW()
) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS supporter_tiers (
    tier_key TEXT PRIMARY KEY CHECK (tier_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    sort_order INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

-- A version's amount never changes; a new amount is a new version.
CREATE TABLE IF NOT EXISTS supporter_tier_versions (
    tier_version_id UUID PRIMARY KEY,
    tier_key TEXT NOT NULL REFERENCES supporter_tiers(tier_key),
    version INTEGER NOT NULL CHECK (version >= 1),
    name_key TEXT NOT NULL CHECK (char_length(name_key) BETWEEN 1 AND 120),
    description_key TEXT NOT NULL CHECK (char_length(description_key) BETWEEN 1 AND 120),
    amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 100 AND 1000000),
    currency TEXT NOT NULL CHECK (currency = 'usd'),
    current BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    retired_at TIMESTAMPTZ,
    UNIQUE (tier_key, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supporter_tier_one_current_version
    ON supporter_tier_versions (tier_key) WHERE current;

CREATE TABLE IF NOT EXISTS supporter_tier_prices (
    tier_version_id UUID NOT NULL REFERENCES supporter_tier_versions(tier_version_id),
    recipient_id UUID NOT NULL REFERENCES payment_recipients(recipient_id),
    stripe_price_id TEXT NOT NULL UNIQUE CHECK (
        stripe_price_id ~ '^price_[A-Za-z0-9]{1,255}$'
    ),
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tier_version_id, recipient_id)
);

-- One Stripe customer per donor per Stripe account. Email and card details
-- stay in Stripe.
CREATE TABLE IF NOT EXISTS donor_accounts (
    donor_account_id UUID PRIMARY KEY,
    donor_did TEXT CHECK (
        donor_did IS NULL OR donor_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    recipient_id UUID NOT NULL REFERENCES payment_recipients(recipient_id),
    stripe_customer_id TEXT NOT NULL CHECK (
        stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,255}$'
    ),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (recipient_id, stripe_customer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_donor_accounts_did_recipient
    ON donor_accounts (donor_did, recipient_id) WHERE donor_did IS NOT NULL;

CREATE TABLE IF NOT EXISTS donations (
    donation_id UUID PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES payment_recipients(recipient_id),
    donor_did TEXT CHECK (
        donor_did IS NULL OR donor_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    stripe_checkout_session_id TEXT NOT NULL UNIQUE CHECK (
        stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{1,255}$'
    ),
    stripe_payment_intent_id TEXT UNIQUE CHECK (
        stripe_payment_intent_id IS NULL
        OR stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]{1,255}$'
    ),
    amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 100 AND 1000000),
    currency TEXT NOT NULL CHECK (currency = 'usd'),
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'succeeded', 'failed', 'refunded', 'disputed')
    ),
    livemode BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    succeeded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_donations_donor
    ON donations (donor_did, created_at) WHERE donor_did IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_donations_recipient
    ON donations (recipient_id, status, created_at);

CREATE TABLE IF NOT EXISTS supporter_subscriptions (
    subscription_id UUID PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES payment_recipients(recipient_id),
    tier_version_id UUID NOT NULL REFERENCES supporter_tier_versions(tier_version_id),
    donor_did TEXT CHECK (
        donor_did IS NULL OR donor_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    stripe_subscription_id TEXT NOT NULL UNIQUE CHECK (
        stripe_subscription_id ~ '^sub_[A-Za-z0-9]{1,255}$'
    ),
    status TEXT NOT NULL CHECK (
        status IN (
            'incomplete', 'incomplete_expired', 'trialing', 'active',
            'past_due', 'canceled', 'unpaid', 'paused'
        )
    ),
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    paused_reason TEXT CHECK (
        paused_reason IS NULL OR paused_reason IN (
            'recipient-ineligible', 'recipient-suspended', 'donor'
        )
    ),
    livemode BOOLEAN NOT NULL,
    -- Stripe's own object timestamp; older webhook deliveries never overwrite newer state.
    stripe_state_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supporter_subscriptions_donor
    ON supporter_subscriptions (donor_did, status) WHERE donor_did IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supporter_subscriptions_recipient
    ON supporter_subscriptions (recipient_id, status);

CREATE TABLE IF NOT EXISTS supporter_recognition (
    donor_did TEXT PRIMARY KEY CHECK (
        donor_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    badge_visible BOOLEAN NOT NULL DEFAULT FALSE,
    listed_publicly BOOLEAN NOT NULL DEFAULT FALSE,
    share_name_with_recipient BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL
);

-- Webhook receipts store identifiers only. Processing re-fetches the event
-- from Stripe, so no payload (and no donor email or card metadata) is kept.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    stripe_event_id TEXT PRIMARY KEY CHECK (
        stripe_event_id ~ '^evt_[A-Za-z0-9]{1,255}$'
    ),
    source TEXT NOT NULL CHECK (source IN ('platform', 'connect')),
    stripe_account_id TEXT CHECK (
        stripe_account_id IS NULL OR stripe_account_id ~ '^acct_[A-Za-z0-9]{1,255}$'
    ),
    event_type TEXT NOT NULL CHECK (
        event_type ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$' AND char_length(event_type) <= 120
    ),
    livemode BOOLEAN NOT NULL,
    stripe_created_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'processed', 'ignored', 'dead-letter')
    ),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL,
    locked_until TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    last_error_code TEXT CHECK (
        last_error_code IS NULL OR last_error_code ~ '^[A-Z0-9_]{1,80}$'
    ),
    CHECK (
        (source = 'platform' AND stripe_account_id IS NULL)
        OR (source = 'connect' AND stripe_account_id IS NOT NULL)
    ),
    CHECK (
        (status IN ('processed', 'ignored') AND processed_at IS NOT NULL)
        OR status IN ('pending', 'dead-letter')
    )
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_due
    ON payment_webhook_events (next_attempt_at, stripe_created_at)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS payment_audit_events (
    audit_id BIGSERIAL PRIMARY KEY,
    recipient_id UUID REFERENCES payment_recipients(recipient_id),
    actor_did TEXT,
    action TEXT NOT NULL CHECK (action ~ '^[a-z]+(-[a-z]+)*$'),
    details JSONB NOT NULL CHECK (
        NOT (details ? 'email')
        AND NOT (details ? 'card')
        AND NOT (details ? 'paymentMethod')
    ),
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_events_recipient
    ON payment_audit_events (recipient_id, occurred_at, audit_id);
