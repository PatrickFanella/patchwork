import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ownerDid = 'did:plc:org-donation-owner';
const eligibleId = '61111111-1111-4111-8111-111111111111';
const ineligibleId = '61111111-1111-4111-8111-222222222222';
const organization = (id: string, name: string) => ({
    id,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    name,
    description: `${name} serves the neighborhood.`,
    origin: 'visitor-created',
    provenance: null,
    nonEndorsementLabel: 'Listed for public information. Patchwork does not endorse or guarantee this organization.',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
});
const supportOptions = {
    paymentsEnabled: true,
    mode: 'test',
    currency: 'usd',
    receipt: { mode: 'non-deductible' },
    oneTime: { minMinor: 100, maxMinor: 1_000_000, suggestedMinor: [1_000, 2_500, 5_000] },
    tiers: [
        { key: 'tier-1', version: 1, nameKey: 'support.tiers.tier1.name', descriptionKey: 'support.tiers.tier1.description', amountMinor: 500, currency: 'usd' },
        { key: 'tier-2', version: 1, nameKey: 'support.tiers.tier2.name', descriptionKey: 'support.tiers.tier2.description', amountMinor: 1_500, currency: 'usd' },
    ],
};

const mockApi = async (page: Page, input: { signedIn: boolean; payments?: Record<string, unknown> }) => {
    const checkoutBodies: Array<Record<string, unknown>> = [];
    const onboardingBodies: Array<Record<string, unknown>> = [];
    const eligibilityQueries: string[][] = [];
    await page.route('https://checkout.stripe.test/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<h1>Stripe Checkout stand-in</h1>' }));
    await page.route('https://connect.stripe.test/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<h1>Stripe onboarding stand-in</h1>' }));
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.replace(/^\/api/u, '');
        const fulfill = (body: unknown, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/auth/session') {
            return fulfill({ session: input.signedIn ? { did: ownerDid, expiresAt: '2099-01-01T00:00:00Z' } : null });
        }
        if (path === '/account/onboarding') {
            return fulfill({ policyVersion: '2026-07-28', requiredDocuments: [], consentRequired: false, acceptedAt: '2026-08-05T00:00:00Z' });
        }
        if (path === '/organizations' && request.method() === 'GET') {
            return fulfill({ organizations: [
                organization(eligibleId, 'Westside Pantry'),
                organization(ineligibleId, 'Eastside Tool Library'),
            ] });
        }
        if (path === '/organizations/mine') {
            return fulfill({ organizations: input.signedIn ? [{
                ...organization(eligibleId, 'Westside Pantry'),
                membership: {
                    organizationId: eligibleId, memberDid: ownerDid, role: 'owner', status: 'active',
                    invitedByDid: ownerDid, joinedAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z',
                },
            }] : [] });
        }
        if (path === '/organizations/members' || path === '/organizations/stewardships' || path === '/organizations/resources') {
            return fulfill({ members: [], stewardships: [], resources: [] });
        }
        if (path === '/support/tiers') return fulfill(supportOptions);
        if (path === '/support/recipients') {
            eligibilityQueries.push(url.searchParams.getAll('organization'));
            return fulfill({ eligibleOrganizationIds: [eligibleId] });
        }
        if (path === '/support/checkout' && request.method() === 'POST') {
            checkoutBodies.push(request.postDataJSON() as Record<string, unknown>);
            return fulfill({ checkoutId: '61111111-1111-4111-8111-333333333333', url: 'https://checkout.stripe.test/c/org' }, 201);
        }
        if (path === '/organizations/payments') {
            return fulfill(input.payments ?? {
                organizationId: eligibleId, status: 'not-started', verified: true, chargesEnabled: false,
                payoutsEnabled: false, detailsSubmitted: false, eligible: false, dashboardUrl: null,
                activeMonthlySupporters: 0, monthlyRecurringMinor: 0, months: [],
            });
        }
        if (path === '/organizations/payments/onboarding') {
            onboardingBodies.push(request.postDataJSON() as Record<string, unknown>);
            return fulfill({ url: `https://connect.stripe.test/setup/acct_1Westside` });
        }
        return fulfill({ error: { code: 'NOT_FOUND', message: 'Not mocked.' } }, 404);
    });
    return { checkoutBodies, onboardingBodies, eligibilityQueries };
};

test('visitors can donate monthly to an eligible organization and only see Donate where it applies', async ({ page }) => {
    const recorded = await mockApi(page, { signedIn: false });
    await page.goto('/organizations');
    const eligible = page.getByRole('article', { name: 'Westside Pantry' });
    const ineligible = page.getByRole('article', { name: 'Eastside Tool Library' });
    await expect(eligible.getByRole('button', { name: 'Donate' })).toBeVisible();
    await expect(ineligible.getByRole('button', { name: 'Donate' })).toHaveCount(0);
    expect(recorded.eligibilityQueries[0]?.sort()).toEqual([eligibleId, ineligibleId].sort());

    await eligible.getByRole('button', { name: 'Donate' }).click();
    const form = page.getByRole('group', { name: 'Donate to Westside Pantry' });
    await expect(form).toContainText('goes directly to Westside Pantry');
    await expect(form).toContainText('does not decide whether your gift is tax-deductible');
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations).toEqual([]);

    await form.getByText('Monthly', { exact: true }).click();
    await form.getByRole('button', { name: 'Choose Block' }).click();
    await page.waitForURL('https://checkout.stripe.test/c/org');
    expect(recorded.checkoutBodies).toEqual([
        { recipient: { organizationId: eligibleId }, mode: 'monthly', tierKey: 'tier-2' },
    ]);
});

test('an owner starts Stripe onboarding from the organization payments panel', async ({ page }) => {
    const recorded = await mockApi(page, { signedIn: true });
    await page.goto('/organizations');
    const panel = page.getByRole('article', { name: 'Donations' });
    await expect(panel).toContainText('Donations are not set up yet.');
    await panel.getByRole('button', { name: 'Set up donations with Stripe' }).click();
    await page.waitForURL('https://connect.stripe.test/setup/acct_1Westside');
    expect(recorded.onboardingBodies).toEqual([{ organizationId: eligibleId }]);
});

test('an active organization sees totals and a Stripe Dashboard link in Spanish', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('patchwork-locale', 'es'));
    await mockApi(page, {
        signedIn: true,
        payments: {
            organizationId: eligibleId, status: 'active', verified: true, chargesEnabled: true,
            payoutsEnabled: false, detailsSubmitted: true, eligible: true,
            dashboardUrl: 'https://dashboard.stripe.com/',
            activeMonthlySupporters: 3, monthlyRecurringMinor: 4_500,
            months: [{ month: '2026-10', giftCount: 2, giftTotalMinor: 6_000 }],
        },
    });
    await page.goto(`/organizations?payments=${eligibleId}&onboarding=return`);
    const panel = page.getByRole('article', { name: 'Donaciones' });
    await expect(panel).toContainText('Ya se puede donar a esta organización.');
    await expect(panel).toContainText('Stripe aún no activa los pagos.');
    await expect(panel).toContainText('Donantes mensuales: 3');
    await expect(panel).toContainText('octubre de 2026');
    await expect(panel.getByRole('link', { name: 'Abrir el panel de Stripe' })).toHaveAttribute('href', 'https://dashboard.stripe.com/');
    await expect(panel.getByRole('button', { name: /Stripe/u })).toHaveCount(0);
});
