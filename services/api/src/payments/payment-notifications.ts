import type { PoolClient } from 'pg';

export type PaymentNotificationKind =
    | 'support_receipt'
    | 'support_payment_failed'
    | 'support_subscription_ending'
    | 'support_recipient_paused';

/**
 * English copy. Spanish copy lives with the other notification translations.
 * Neither names an amount or a recipient, because email and push payloads
 * carry the same text.
 */
const copy: Readonly<Record<PaymentNotificationKind, { title: string; body: string; priority: string }>> = {
    support_receipt: {
        title: 'Your gift was received',
        body: 'Thank you. Stripe emails your receipt. Your giving history is in Settings.',
        priority: 'low',
    },
    support_payment_failed: {
        title: 'Your gift could not be charged',
        body: 'Update your payment method in Stripe from Settings to keep your monthly gift going.',
        priority: 'high',
    },
    support_subscription_ending: {
        title: 'Your monthly gift is ending',
        body: 'Your monthly gift will not renew. See the details in Settings.',
        priority: 'normal',
    },
    support_recipient_paused: {
        title: 'Your monthly gift is paused',
        body: 'The organization can no longer receive gifts through Patchwork. You will not be charged while it is paused.',
        priority: 'normal',
    },
};

/** Queue a donor notification in the caller's transaction. Duplicate keys are ignored. */
export const notifyDonor = async (
    client: PoolClient,
    donorDid: string | null | undefined,
    kind: PaymentNotificationKind,
    deduplicationKey: string,
    occurredAt: Date,
): Promise<void> => {
    if (!donorDid) return;
    const { title, body, priority } = copy[kind];
    await client.query(
        `SELECT patchwork_enqueue_notification($1, $2, $3, $4, $5, '/settings', '{}'::jsonb, $6, $7)`,
        [donorDid, kind, title, body, priority, deduplicationKey, occurredAt],
    );
};
