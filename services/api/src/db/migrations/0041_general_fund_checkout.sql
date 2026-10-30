-- General-fund Checkout. A row is written before Stripe is called, so a
-- retried request with the same client key reuses the same Stripe
-- idempotency key and the same Checkout Session.
CREATE TABLE IF NOT EXISTS payment_checkout_sessions (
    checkout_id UUID PRIMARY KEY,
    client_key UUID NOT NULL UNIQUE,
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    recipient_id UUID NOT NULL REFERENCES payment_recipients(recipient_id),
    mode TEXT NOT NULL CHECK (mode IN ('one-time', 'monthly')),
    amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 100 AND 1000000),
    currency TEXT NOT NULL CHECK (currency = 'usd'),
    tier_version_id UUID REFERENCES supporter_tier_versions(tier_version_id),
    donor_did TEXT CHECK (
        donor_did IS NULL OR donor_did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    stripe_checkout_session_id TEXT UNIQUE CHECK (
        stripe_checkout_session_id IS NULL
        OR stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{1,255}$'
    ),
    checkout_url TEXT CHECK (
        checkout_url IS NULL
        OR (checkout_url LIKE 'https://%' AND char_length(checkout_url) <= 2048)
    ),
    status TEXT NOT NULL CHECK (
        status IN ('creating', 'open', 'complete', 'expired', 'failed')
    ),
    livemode BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK ((mode = 'monthly') = (tier_version_id IS NOT NULL)),
    CHECK (
        status IN ('creating', 'failed')
        OR (stripe_checkout_session_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_payment_checkout_sessions_donor
    ON payment_checkout_sessions (donor_did, created_at)
    WHERE donor_did IS NOT NULL;

-- Subscriptions remember the Checkout that created them, for donor identity
-- and tier lookup when a subscription event arrives before checkout completion.
ALTER TABLE supporter_subscriptions
    ADD COLUMN IF NOT EXISTS checkout_id UUID
        REFERENCES payment_checkout_sessions(checkout_id);

-- Placeholder ladder. Names are web translation keys; the owner replaces
-- names and amounts by adding new versions, never by editing these rows.
INSERT INTO supporter_tiers (tier_key, sort_order, active, created_at, updated_at)
VALUES
    ('tier-1', 1, TRUE, NOW(), NOW()),
    ('tier-2', 2, TRUE, NOW(), NOW()),
    ('tier-3', 3, TRUE, NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO supporter_tier_versions (
    tier_version_id, tier_key, version, name_key, description_key,
    amount_minor, currency, current, created_at
) VALUES
    ('00000000-0000-4000-8000-000000000101', 'tier-1', 1,
     'support.tiers.tier1.name', 'support.tiers.tier1.description',
     500, 'usd', TRUE, NOW()),
    ('00000000-0000-4000-8000-000000000102', 'tier-2', 1,
     'support.tiers.tier2.name', 'support.tiers.tier2.description',
     1500, 'usd', TRUE, NOW()),
    ('00000000-0000-4000-8000-000000000103', 'tier-3', 1,
     'support.tiers.tier3.name', 'support.tiers.tier3.description',
     4000, 'usd', TRUE, NOW())
ON CONFLICT DO NOTHING;
