import { expect, test } from '@playwright/test';

test('API failure stays visible and never substitutes fixture discovery data', async ({
    page,
}) => {
    let discoveryRequests = 0;
    await page.route('**/api/**', async route => {
        if (route.request().url().includes('/query/map')) discoveryRequests += 1;
        await route.abort('failed');
    });

    await page.goto('/map');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('network NETWORK_ERROR');
    await expect(page.getByText('API unavailable')).toBeVisible();
    await expect(page.getByText('Need groceries before 21:00')).toHaveCount(0);

    await page.getByRole('button', { name: 'Retry discovery' }).click();
    await expect.poll(() => discoveryRequests).toBeGreaterThan(1);
});

test('public home advertises only implemented alpha capabilities', async ({
    page,
}) => {
    await page.goto('/');

    await expect(
        page.getByRole('heading', { name: 'Pre-alpha operating boundary' }),
    ).toBeVisible();
    await expect(page.getByText('Durable projections')).toBeVisible();
    await expect(page.getByText('127', { exact: true })).toHaveCount(0);
    await expect(page.getByText('11m', { exact: true })).toHaveCount(0);
    await expect(page.getByText('42', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/localhost:4[012]00/)).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Open chat handoff' }),
    ).toHaveCount(0);

    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Volunteer' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Chat' })).toBeHidden();
});

test('authenticated production settings expose durable account controls only', async ({
    page,
    baseURL,
}) => {
    if (!baseURL) throw new Error('Playwright baseURL is required.');
    await page.context().addCookies([
        {
            name: 'patchwork_csrf',
            value: 'account-controls-csrf',
            url: baseURL,
        },
    ]);
    let deactivated = false;
    let exportRequests = 0;
    let preferences = {
        privacy: 'community',
        notifications: { inApp: true, email: true, push: false },
        visibility: 'authenticated',
        language: 'en',
        location: { sharing: 'approximate', noPermanentAddress: false },
    };
    let deactivationBody: unknown;
    let deactivationCsrf: string | undefined;
    await page.route('**/api/**', async route => {
        const request = route.request();
        const apiPath = new URL(request.url()).pathname.replace(/^\/api/, '');
        if (apiPath === '/auth/session') {
            if (deactivated) {
                await route.fulfill({
                    status: 401,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        error: {
                            code: 'AUTHENTICATION_REQUIRED',
                            message: 'Authentication required.',
                        },
                    }),
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    session: {
                        did: 'did:plc:account-controls',
                        expiresAt: '2099-01-01T00:00:00.000Z',
                    },
                }),
            });
            return;
        }
        if (apiPath === '/account/onboarding') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    policyVersion: '2026-07-28',
                    requiredDocuments: [
                        'terms-of-use',
                        'privacy-notice',
                        'community-guidelines',
                        'synthetic-data-disclosure',
                        'location-sharing-consent',
                    ],
                    consentRequired: false,
                    acceptedAt: '2026-07-28T00:00:00.000Z',
                }),
            });
            return;
        }
        if (apiPath === '/account/preferences') {
            if (request.method() === 'PUT') {
                preferences = request.postDataJSON().preferences;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ preferences }),
            });
            return;
        }
        if (apiPath === '/account/export') {
            exportRequests += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    formatVersion: '1.0',
                    generatedAt: '2026-07-28T00:00:00.000Z',
                    subject: { did: 'did:plc:account-controls' },
                    data: {},
                    exclusions: [],
                }),
            });
            return;
        }
        if (apiPath === '/account/deactivate') {
            deactivationBody = request.postDataJSON();
            deactivationCsrf = request.headers()['x-csrf-token'];
            deactivated = true;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 'deactivated',
                    effectiveAt: '2026-07-28T00:00:00.000Z',
                    removed: {},
                    revoked: { browserSessions: 1, oauthSessions: 1 },
                    retained: { deactivationReceipt: 1 },
                }),
            });
            return;
        }
        await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
                error: { code: 'NOT_FOUND', message: 'Not found.' },
            }),
        });
    });

    await page.goto('/settings');

    await expect(
        page.getByRole('heading', { name: 'Account privacy' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Download data export' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Deactivate account' }),
    ).toBeVisible();
    await expect(page.getByText('Privacy and delivery preferences')).toBeVisible();
    await page
        .getByRole('article', { name: 'Privacy and delivery preferences' })
        .getByRole('combobox', { name: /^Privacy/ })
        .selectOption('private');
    await page.getByLabel('I do not have a permanent address').check();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved.')).toBeVisible();
    expect(preferences).toMatchObject({
        privacy: 'private',
        location: { noPermanentAddress: true },
    });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download data export' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
        'patchwork-account-export.json',
    );
    expect(exportRequests).toBe(1);

    await page.getByRole('button', { name: 'Deactivate account' }).click();
    await expect(
        page.getByRole('alertdialog', {
            name: 'Confirm account deactivation',
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Keep account active' }).click();
    await expect(
        page.getByRole('alertdialog', {
            name: 'Confirm account deactivation',
        }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Deactivate account' }).click();
    await page.getByRole('button', { name: 'Confirm deactivation' }).click();

    await expect(
        page.getByRole('region', { name: 'Sign in required' }),
    ).toBeVisible();
    expect(deactivationBody).toEqual({});
    expect(deactivationCsrf).toBe('account-controls-csrf');
});

test('expired policy consent blocks protected UI until every policy and 18+ assertion is accepted', async ({
    page,
}) => {
    let consentBody: unknown;
    await page.route('**/api/**', async route => {
        const request = route.request();
        const apiPath = new URL(request.url()).pathname.replace(/^\/api/, '');
        if (apiPath === '/auth/session') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    session: {
                        did: 'did:plc:renew-consent',
                        expiresAt: '2099-01-01T00:00:00.000Z',
                    },
                }),
            });
            return;
        }
        if (apiPath === '/account/onboarding') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    policyVersion: '2026-07-28',
                    requiredDocuments: [
                        'terms-of-use',
                        'privacy-notice',
                        'community-guidelines',
                        'synthetic-data-disclosure',
                        'location-sharing-consent',
                    ],
                    consentRequired: true,
                    acceptedAt: null,
                }),
            });
            return;
        }
        if (apiPath === '/account/consent') {
            consentBody = request.postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    policyVersion: '2026-07-28',
                    requiredDocuments: [
                        'terms-of-use',
                        'privacy-notice',
                        'community-guidelines',
                        'synthetic-data-disclosure',
                        'location-sharing-consent',
                    ],
                    consentRequired: false,
                    acceptedAt: '2026-07-28T12:00:00.000Z',
                }),
            });
            return;
        }
        await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
                error: { code: 'NOT_FOUND', message: 'Not found.' },
            }),
        });
    });

    await page.goto('/settings');
    await expect(
        page.getByText('Material changes require a new acceptance'),
    ).toBeVisible();
    const continueButton = page.getByRole('button', {
        name: 'Accept and continue',
    });
    await expect(continueButton).toBeDisabled();
    for (const checkbox of await page.getByRole('checkbox').all()) {
        await checkbox.check();
    }
    await continueButton.click();
    await expect(
        page.getByRole('heading', { name: 'Account privacy' }),
    ).toBeVisible();
    expect(consentBody).toEqual({
        policyVersion: '2026-07-28',
        asserted18OrOlder: true,
        acceptedDocuments: [
            'terms-of-use',
            'privacy-notice',
            'community-guidelines',
            'synthetic-data-disclosure',
            'location-sharing-consent',
        ],
    });
    expect(JSON.stringify(consentBody)).not.toContain('did:');
});
