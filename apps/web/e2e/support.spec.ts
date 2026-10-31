import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const checkoutId = '51111111-1111-4111-8111-111111111111';
const options = (overrides: Record<string, unknown> = {}) => ({
    paymentsEnabled: true,
    mode: 'test',
    currency: 'usd',
    receipt: { mode: 'non-deductible' },
    oneTime: { minMinor: 100, maxMinor: 1_000_000, suggestedMinor: [1_000, 2_500, 5_000] },
    tiers: [
        { key: 'tier-1', version: 1, nameKey: 'support.tiers.tier1.name', descriptionKey: 'support.tiers.tier1.description', amountMinor: 500, currency: 'usd' },
        { key: 'tier-2', version: 1, nameKey: 'support.tiers.tier2.name', descriptionKey: 'support.tiers.tier2.description', amountMinor: 1_500, currency: 'usd' },
        { key: 'tier-3', version: 1, nameKey: 'support.tiers.tier3.name', descriptionKey: 'support.tiers.tier3.description', amountMinor: 4_000, currency: 'usd' },
    ],
    ...overrides,
});

interface Recorded {
    checkoutBodies: Array<Record<string, unknown>>;
    checkoutKeys: string[];
    portalRequests: number;
}

const mockApi = async (
    page: Page,
    input: {
        did?: string;
        language?: 'en' | 'es';
        supportOptions?: Record<string, unknown>;
        checkoutStatuses?: Array<Record<string, unknown>>;
        accountSupport?: Record<string, unknown>;
    },
): Promise<Recorded> => {
    const recorded: Recorded = { checkoutBodies: [], checkoutKeys: [], portalRequests: 0 };
    const statuses = [...(input.checkoutStatuses ?? [])];
    await page.route('https://checkout.stripe.test/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<h1>Stripe Checkout stand-in</h1>' }),
    );
    await page.route('https://billing.stripe.test/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<h1>Stripe portal stand-in</h1>' }),
    );
    await page.route('**/api/**', async (route: Route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/^\/api/u, '');
        const fulfill = (body: unknown, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/auth/session') {
            return input.did ?
                    fulfill({ session: { did: input.did, expiresAt: '2099-01-01T00:00:00Z' } })
                :   fulfill({ session: null });
        }
        if (path === '/account/onboarding') {
            return fulfill({ policyVersion: '2026-07-28', requiredDocuments: [], consentRequired: false, acceptedAt: '2026-08-05T00:00:00Z' });
        }
        if (path === '/account/preferences') {
            return fulfill({ preferences: {
                privacy: 'private',
                notifications: { inApp: true, email: false, push: false },
                visibility: 'authenticated',
                language: input.language ?? 'en',
                location: { sharing: 'hidden', noPermanentAddress: false },
            } });
        }
        if (path === '/support/tiers') return fulfill(input.supportOptions ?? options());
        if (path === '/support/checkout' && request.method() === 'POST') {
            recorded.checkoutBodies.push(request.postDataJSON() as Record<string, unknown>);
            recorded.checkoutKeys.push(request.headers()['idempotency-key'] ?? '');
            return fulfill({ checkoutId, url: `https://checkout.stripe.test/c/${checkoutId}` }, 201);
        }
        if (path === '/support/checkout') {
            const status = statuses.length > 1 ? statuses.shift() : statuses[0];
            return status ?
                    fulfill(status)
                :   fulfill({ error: { code: 'CHECKOUT_NOT_FOUND', message: 'Not found.' } }, 404);
        }
        if (path === '/support/portal') {
            recorded.portalRequests += 1;
            return fulfill({ url: 'https://billing.stripe.test/session' });
        }
        if (path === '/account/support') {
            return fulfill(input.accountSupport ?? { donations: [], subscriptions: [], manageable: [], isSupporter: false, recognition: { badgeVisible: false, listedPublicly: false, shareNameWithRecipient: false } });
        }
        return fulfill({ error: { code: 'NOT_FOUND', message: 'Not mocked.' } }, 404);
    });
    return recorded;
};

test('a signed-out visitor gives once and sees the confirmed gift', async ({ page }) => {
    const recorded = await mockApi(page, {
        checkoutStatuses: [
            { checkoutId, mode: 'one-time', amountMinor: 3_050, currency: 'usd', recipientName: 'Patchwork general fund', status: 'open', paymentStatus: null },
            { checkoutId, mode: 'one-time', amountMinor: 3_050, currency: 'usd', recipientName: 'Patchwork general fund', status: 'complete', paymentStatus: 'succeeded' },
        ],
    });
    await page.goto('/support');
    await expect(page.getByRole('heading', { level: 1, name: 'Give to the Patchwork general fund' })).toBeVisible();
    await expect(page.getByText('Test mode: Stripe will not charge a real card.')).toBeVisible();
    await expect(page.getByText('gifts to the general fund are not tax-deductible')).toBeVisible();
    await expect(page.getByText('Giving does not arrange help')).toBeVisible();
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations).toEqual([]);

    const amount = page.getByLabel('Amount in US dollars');
    await page.getByRole('button', { name: '$50.00' }).click();
    await expect(amount).toHaveValue('50');
    await amount.fill('0.50');
    await page.getByRole('button', { name: /^Give/u }).click();
    await expect(page.getByText('Enter an amount between $1.00 and $10,000.00')).toBeVisible();
    expect(recorded.checkoutBodies).toEqual([]);

    await amount.fill('30.50');
    await page.getByRole('button', { name: 'Give $30.50' }).click();
    await page.waitForURL(`https://checkout.stripe.test/c/${checkoutId}`);
    expect(recorded.checkoutBodies).toEqual([{ recipient: 'general-fund', mode: 'one-time', amountMinor: 3_050 }]);
    expect(recorded.checkoutKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);

    await page.goto(`/support/thanks?checkout=${checkoutId}`);
    await expect(page.getByRole('status').filter({ hasText: 'Your gift of $30.50 to Patchwork general fund went through.' })).toBeVisible({ timeout: 10_000 });
});

test('a signed-in supporter starts monthly giving and manages it from Settings in Spanish', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('patchwork-locale', 'es'));
    const recorded = await mockApi(page, {
        did: 'did:plc:support-browser',
        language: 'es',
        accountSupport: {
            donations: [{ donationId: 'd1', recipientName: 'Patchwork general fund', amountMinor: 2_500, currency: 'usd', status: 'refunded', createdAt: '2026-10-01T12:00:00Z' }],
            subscriptions: [{ subscriptionId: 's1', recipientName: 'Patchwork general fund', tierKey: 'tier-2', nameKey: 'support.tiers.tier2.name', amountMinor: 1_500, currency: 'usd', status: 'active', currentPeriodEnd: '2026-11-30T12:00:00Z', cancelAtPeriodEnd: true }],
            manageable: [{ recipientId: '00000000-0000-4000-8000-000000000001', recipientName: 'Patchwork general fund' }],
            isSupporter: true,
            recognition: { badgeVisible: false, listedPublicly: false, shareNameWithRecipient: false },
        },
    });
    await page.goto('/support');
    await page.getByText('Cada mes', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cuadra' })).toBeVisible();
    await page.getByRole('button', { name: 'Elegir Cuadra' }).click();
    await page.waitForURL(`https://checkout.stripe.test/c/${checkoutId}`);
    expect(recorded.checkoutBodies).toEqual([{ recipient: 'general-fund', mode: 'monthly', tierKey: 'tier-2' }]);

    await page.goto('/settings');
    const supporting = page.getByRole('article', { name: 'Tu apoyo a Patchwork' });
    await expect(supporting).toContainText('Cuadra');
    await expect(supporting).toContainText('Activa');
    await expect(supporting).toContainText('Termina el');
    await expect(supporting).toContainText('Reembolsada');
    await supporting.getByRole('button', { name: 'Administrar en Stripe' }).click();
    await page.waitForURL('https://billing.stripe.test/session');
    expect(recorded.portalRequests).toBe(1);
});

test('giving stays closed when payments are off, and cancelled or unknown checkouts say so', async ({ page }) => {
    await mockApi(page, { supportOptions: options({ paymentsEnabled: false, mode: 'off' }) });
    await page.goto('/support');
    await expect(page.getByText('Giving through Patchwork is not available right now.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Give/u })).toHaveCount(0);

    await page.goto(`/support/cancelled?checkout=${checkoutId}`);
    await expect(page.getByText('Nothing was charged.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to giving' })).toHaveAttribute('href', '/support');

    await page.goto('/support/thanks?checkout=51111111-1111-4111-8111-999999999999');
    await expect(page.getByText('We could not find that checkout.')).toBeVisible();
});
