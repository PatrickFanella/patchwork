-- Refund and dispute state by PaymentIntent. A charge can be refunded or
-- disputed within seconds, and those events are older than the Checkout
-- completion that records the gift, so the sweep applies them first. Keeping
-- the state here lets the gift take it when it is recorded.
CREATE TABLE IF NOT EXISTS payment_charge_states (
    stripe_payment_intent_id TEXT PRIMARY KEY CHECK (
        stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]{1,255}$'
    ),
    recipient_id UUID NOT NULL REFERENCES payment_recipients(recipient_id),
    refunded BOOLEAN NOT NULL DEFAULT FALSE,
    dispute_open BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_charge_states_updated
    ON payment_charge_states (updated_at);
