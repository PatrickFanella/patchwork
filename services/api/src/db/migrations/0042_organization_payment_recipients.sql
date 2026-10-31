-- Deleting an organization (for example when its last owner deactivates)
-- must keep its payment history. Close the recipient first so the
-- ON DELETE SET NULL reference satisfies the closed-recipient check.
CREATE OR REPLACE FUNCTION close_payment_recipient_before_organization_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE payment_recipients
       SET status = 'closed', updated_at = NOW()
     WHERE organization_id = OLD.organization_id
       AND status <> 'closed';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_close_payment_recipient_before_organization_delete
    ON organizations;
CREATE TRIGGER trg_close_payment_recipient_before_organization_delete
    BEFORE DELETE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION close_payment_recipient_before_organization_delete();

-- Organization recipients become active only with a connected account.
ALTER TABLE payment_recipients
    ADD CONSTRAINT payment_recipients_active_account CHECK (
        kind = 'general-fund' OR status <> 'active' OR stripe_account_id IS NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_supporter_subscriptions_unpaused
    ON supporter_subscriptions (recipient_id)
    WHERE paused_reason IS NULL
      AND status IN ('active', 'trialing', 'past_due');
