import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const updatedAt = '2026-10-31T12:00:00.000Z';
const fridgeId = '61111111-1111-4111-8111-111111111111';
const pantryId = '61111111-1111-4111-8111-222222222222';

const recipient = (recipientId: string, displayName: string, status: string, suspensionReason: string | null = null) => ({
    recipientId, organizationId: null, displayName, status, chargesEnabled: true,
    suspensionReason, activeMonthlyGifts: status === 'suspended' ? 0 : 2, updatedAt,
});

const mockApi = async (page: Page, role: 'user' | 'moderator') => {
    const moderationBodies: Array<{ path: string; body: Record<string, unknown> }> = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/^\/api/u, '');
        const fulfill = (body: unknown, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/auth/session') {
            return fulfill({ session: { did: `did:plc:${role}`, role, expiresAt: '2099-01-01T00:00:00Z' } });
        }
        if (path === '/account/onboarding') {
            return fulfill({ policyVersion: '2026-07-28', requiredDocuments: [], consentRequired: false, acceptedAt: updatedAt });
        }
        if (path === '/account/preferences') {
            return fulfill({ preferences: {
                privacy: 'private', notifications: { inApp: true, email: false, push: false },
                visibility: 'authenticated', language: 'en',
                location: { sharing: 'hidden', noPermanentAddress: false },
            } });
        }
        if (path === '/account/support') {
            return fulfill({
                donations: [],
                subscriptions: [
                    { subscriptionId: 's1', recipientName: 'Patchwork general fund', tierKey: 'tier-2', nameKey: 'support.tiers.tier2.name', amountMinor: 1_500, currency: 'usd', status: 'active', currentPeriodEnd: '2026-11-30T12:00:00Z', cancelAtPeriodEnd: false },
                    { subscriptionId: 's2', recipientName: 'Corner Fridge', tierKey: 'tier-1', nameKey: 'support.tiers.tier1.name', amountMinor: 500, currency: 'usd', status: 'active', currentPeriodEnd: '2026-11-15T12:00:00Z', cancelAtPeriodEnd: true },
                ],
                manageable: [],
                isSupporter: true,
                recognition: { badgeVisible: false, listedPublicly: false, shareNameWithRecipient: false },
            });
        }
        if (path === '/moderation/queue') return fulfill({ results: [] });
        if (path === '/maintenance') {
            return fulfill({ maintenance: {
                active: false, reasonCodes: [], publicMessage: 'Operating normally.', activatedAt: null,
                resumedAt: null, version: 1, updatedAt, environmentOverride: false,
            } });
        }
        if (path === '/admin/source-refresh/candidates') return fulfill({ items: [], page: 1, hasNextPage: false });
        if (path === '/moderation/payment-recipients') {
            return fulfill({ recipients: [
                recipient(fridgeId, 'Corner Fridge', 'active'),
                recipient(pantryId, 'Westside Pantry', 'suspended', 'Earlier report'),
            ] });
        }
        if (path.startsWith('/moderation/payment-recipients/')) {
            const body = request.postDataJSON() as Record<string, unknown>;
            moderationBodies.push({ path, body });
            return fulfill({ recipient: path.endsWith('/suspend') ?
                recipient(fridgeId, 'Corner Fridge', 'suspended', String(body['reason']))
            :   recipient(pantryId, 'Westside Pantry', 'active') });
        }
        return fulfill({ error: { code: 'NOT_FOUND', message: 'Not mocked.' } }, 404);
    });
    return { moderationBodies };
};

test('the deactivation confirmation lists monthly gifts that will stop', async ({ page }) => {
    await mockApi(page, 'user');
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Deactivate account' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Monthly gifts that will stop: 1');
    await expect(dialog).toContainText('Patchwork general fund');
    // A gift already set to end is not listed again.
    await expect(dialog).not.toContainText('Corner Fridge');
    await expect(dialog).toContainText('cancels these gifts at the end of the period you have paid for');
});

test('a moderator suspends and restores organization donations with a reason', async ({ page }) => {
    const recorded = await mockApi(page, 'moderator');
    await page.goto('/moderation');
    const panel = page.getByRole('region', { name: 'Organization donations' });
    await expect(panel).toContainText('Suspension reason: Earlier report');

    await panel.getByRole('button', { name: 'Suspend donations to Corner Fridge' }).click();
    await expect(panel).toContainText('Give a reason before suspending or restoring.');
    expect(recorded.moderationBodies).toEqual([]);

    await panel.getByLabel('Reason, kept in the payment audit log').fill('Fraud report 12');
    await panel.getByRole('button', { name: 'Suspend donations to Corner Fridge' }).click();
    await expect(panel).toContainText('Donations to Corner Fridge are suspended.');
    await expect(panel.getByRole('button', { name: 'Restore donations to Corner Fridge' })).toBeVisible();

    await panel.getByLabel('Reason, kept in the payment audit log').fill('Report resolved');
    await panel.getByRole('button', { name: 'Restore donations to Westside Pantry' }).click();
    await expect(panel).toContainText('Donations to Westside Pantry are restored.');
    expect(recorded.moderationBodies).toEqual([
        { path: '/moderation/payment-recipients/suspend', body: { recipientId: fridgeId, reason: 'Fraud report 12' } },
        { path: '/moderation/payment-recipients/restore', body: { recipientId: pantryId, reason: 'Report resolved' } },
    ]);
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations).toEqual([]);
});
