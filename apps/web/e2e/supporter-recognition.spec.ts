import { expect, test, type Page } from '@playwright/test';

const donorDid = 'did:plc:recognition-donor';

const volunteer = (did: string, name: string) => ({
    uri: `at://${did}/app.patchwork.volunteer.profile/self`,
    cid: `bafy-${name}`,
    authorDid: did,
    displayName: name,
    bio: 'Public volunteer profile.',
    capabilities: ['food-delivery'],
    availability: 'within-24h',
    contactPreference: 'chat-only',
    skills: [],
    languages: ['en'],
    serviceArea: null,
    updatedAt: '2026-10-07T12:00:00.000Z',
});

const mockApi = async (page: Page, signedIn: boolean) => {
    const recognitionBodies: Array<Record<string, unknown>> = [];
    const badgeQueries: string[][] = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.replace(/^\/api/u, '');
        const fulfill = (body: unknown, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/auth/session') {
            return signedIn ?
                    fulfill({ session: { did: donorDid, expiresAt: '2099-01-01T00:00:00Z' } })
                :   route.fulfill({ status: 401, json: { error: { code: 'AUTHENTICATION_REQUIRED' } } });
        }
        if (path === '/account/onboarding') {
            return fulfill({ policyVersion: '2026-07-28', requiredDocuments: [], consentRequired: false, acceptedAt: '2026-08-05T00:00:00Z' });
        }
        if (path === '/account/preferences') {
            return fulfill({ preferences: {
                privacy: 'private', notifications: { inApp: true, email: false, push: false },
                visibility: 'authenticated', language: 'en',
                location: { sharing: 'hidden', noPermanentAddress: false },
            } });
        }
        if (path === '/query/volunteers') {
            return fulfill({ page: 1, pageSize: 20, total: 2, hasNextPage: false, results: [
                volunteer('did:plc:badge-holder', 'Rosa'),
                volunteer('did:plc:no-badge', 'Sam'),
            ] });
        }
        if (path === '/support/badges') {
            badgeQueries.push(url.searchParams.getAll('did'));
            return fulfill({ supporterDids: ['did:plc:badge-holder'] });
        }
        if (path === '/support/tiers') {
            return fulfill({
                paymentsEnabled: true, mode: 'live', currency: 'usd', receipt: { mode: 'non-deductible' },
                oneTime: { minMinor: 100, maxMinor: 1_000_000, suggestedMinor: [1_000] }, tiers: [],
            });
        }
        if (path === '/support/supporters') return fulfill({ supporterDids: ['did:plc:listed-a', 'did:plc:listed-b'] });
        if (path === '/identity/handles' || path === '/identity/resolve') {
            return fulfill({ handles: { 'did:plc:listed-a': 'ana.example' } });
        }
        if (path === '/account/support' && request.method() === 'GET') {
            return fulfill({
                donations: [],
                subscriptions: [{ subscriptionId: 's1', recipientName: 'Patchwork general fund', tierKey: 'tier-1', nameKey: 'support.tiers.tier1.name', amountMinor: 500, currency: 'usd', status: 'active', currentPeriodEnd: '2026-11-30T12:00:00Z', cancelAtPeriodEnd: false }],
                manageable: [{ recipientId: '00000000-0000-4000-8000-000000000001', recipientName: 'Patchwork general fund' }],
                isSupporter: true,
                recognition: { badgeVisible: false, listedPublicly: false, shareNameWithRecipient: false },
            });
        }
        if (path === '/account/support/recognition') {
            const body = request.postDataJSON() as Record<string, unknown>;
            recognitionBodies.push(body);
            return fulfill({ recognition: body });
        }
        return fulfill({ error: { code: 'NOT_FOUND', message: 'Not mocked.' } }, 404);
    });
    return { recognitionBodies, badgeQueries };
};

test('volunteer cards show the supporter badge only for opted-in supporters', async ({ page }) => {
    const recorded = await mockApi(page, false);
    await page.goto('/volunteer');
    const rosa = page.getByRole('article', { name: 'Rosa' });
    const sam = page.getByRole('article', { name: 'Sam' });
    await expect(rosa.getByText('Monthly supporter')).toBeVisible();
    await expect(sam.getByText('Monthly supporter')).toHaveCount(0);
    expect(recorded.badgeQueries.at(-1)?.sort()).toEqual(['did:plc:badge-holder', 'did:plc:no-badge']);
});

test('the support page lists opted-in monthly supporters by handle only', async ({ page }) => {
    await mockApi(page, false);
    await page.goto('/support');
    const list = page.getByRole('region', { name: 'Monthly supporters' });
    await expect(list).toContainText('Amounts and tiers are never shown.');
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list).not.toContainText('$');
});

test('a supporter turns recognition on from Settings, starting from all off', async ({ page }) => {
    const recorded = await mockApi(page, true);
    await page.goto('/settings');
    const supporting = page.getByRole('article', { name: 'Supporting Patchwork' });
    const badge = supporting.getByLabel(/Monthly supporter" badge/u);
    const listed = supporting.getByLabel(/List my handle/u);
    const share = supporting.getByLabel(/Let organizations I give to see my handle/u);
    await expect(badge).not.toBeChecked();
    await expect(listed).not.toBeChecked();
    await expect(share).not.toBeChecked();
    await badge.check();
    await share.check();
    await supporting.getByRole('button', { name: 'Save recognition settings' }).click();
    await expect(supporting.getByText('Recognition settings saved.')).toBeVisible();
    expect(recorded.recognitionBodies).toEqual([
        { badgeVisible: true, listedPublicly: false, shareNameWithRecipient: true },
    ]);
});
