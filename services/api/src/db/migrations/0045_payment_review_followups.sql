-- Deactivation removes the donor's DID from their checkouts. A monthly
-- Checkout can still complete afterwards (another tab, or a webhook that was
-- waiting), so the checkout keeps a flag and the new subscription is set to
-- end at period end like the donor's other monthly gifts.
ALTER TABLE payment_checkout_sessions
    ADD COLUMN IF NOT EXISTS donor_deactivated BOOLEAN NOT NULL DEFAULT FALSE;

-- An organization that disconnects its Stripe account from Patchwork can no
-- longer receive gifts, and Patchwork can no longer act on its account, so
-- the pause sweep skips it instead of failing on every run.
ALTER TABLE payment_recipients
    ADD COLUMN IF NOT EXISTS deauthorized_at TIMESTAMPTZ;
