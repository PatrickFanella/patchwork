import { expect, test, type Page } from '@playwright/test';

const requesterDid = 'did:plc:location-browser-requester';
const helperDid = 'did:plc:location-browser-helper';
const connectionId = '81111111-1111-4111-8111-111111111111';
const offerId = '82111111-1111-4111-8111-111111111111';
const requestUri =
    `at://${requesterDid}/app.patchwork.aid.post/location-browser`;

test('two connected accounts exchange an exact location only over an authenticated peer channel', async ({
    browser,
    baseURL,
}) => {
    test.setTimeout(120_000);
    if (!baseURL) throw new Error('Playwright baseURL is required.');

    const consents = new Set<string>();
    const proofs = new Map([
        [requesterDid, 'requester-browser-proof'],
        [helperDid, 'helper-browser-proof'],
    ]);
    const signals: Array<{
        sequence: number;
        fromDid: string;
        kind: 'description' | 'candidate' | 'end-of-candidates';
        payload: Record<string, unknown>;
    }> = [];
    const requestBodies: Array<Record<string, unknown>> = [];
    let sessionId: string | null = null;
    let sessionStatus: 'pending' | 'active' = 'pending';
    let maintenance = false;
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

    const installRoutes = async (page: Page, actorDid: string) => {
        await page.route('**/api/**', async route => {
            const request = route.request();
            const url = new URL(request.url());
            const path = url.pathname.replace(/^\/api/, '');
            const fulfill = (body: unknown, status = 200) =>
                route.fulfill({
                    status,
                    contentType: 'application/json',
                    body: JSON.stringify(body),
                });
            if (path === '/auth/session') {
                await fulfill({
                    session: {
                        did: actorDid,
                        expiresAt: '2099-01-01T00:00:00.000Z',
                    },
                });
                return;
            }
            if (path === '/account/onboarding') {
                await fulfill({
                    policyVersion: '2026-07-28',
                    requiredDocuments: [],
                    consentRequired: false,
                    acceptedAt: new Date().toISOString(),
                });
                return;
            }
            if (path === '/query/feed') {
                await fulfill({
                    total: 0,
                    page: 1,
                    pageSize: 20,
                    hasNextPage: false,
                    results: [],
                });
                return;
            }
            if (path === '/coordination/mine') {
                await fulfill({
                    offers: [],
                    connections: [
                        {
                            id: connectionId,
                            offerId,
                            requestUri,
                            status: 'active',
                            requesterDid,
                            helperDid,
                            counterpartDid:
                                actorDid === requesterDid ?
                                    helperDid
                                :   requesterDid,
                            acceptedAt: new Date().toISOString(),
                            completedAt: null,
                            updatedAt: new Date().toISOString(),
                        },
                    ],
                });
                return;
            }
            if (path === '/inbox') {
                await fulfill({ items: [], unread: 0 });
                return;
            }
            if (path === '/outcomes/mine') {
                await fulfill({ feedback: [] });
                return;
            }
            if (path === '/location/session') {
                const after = Number(url.searchParams.get('after') ?? '0');
                const peerDid =
                    actorDid === requesterDid ? helperDid : requesterDid;
                await fulfill({
                    connectionId,
                    consent: {
                        actorConsented: consents.has(actorDid),
                        peerConsented: consents.has(peerDid),
                        freshForSeconds: 120,
                    },
                    session:
                        sessionId ?
                            {
                                id: sessionId,
                                status: sessionStatus,
                                role:
                                    actorDid === requesterDid ?
                                        'offerer'
                                    :   'answerer',
                                singleUse: true,
                                issuedAt: new Date().toISOString(),
                                expiresAt,
                                participantProof: proofs.get(actorDid),
                                expectedPeerProof: proofs.get(peerDid),
                                signals: signals
                                    .filter(
                                        signal =>
                                            signal.fromDid !== actorDid &&
                                            signal.sequence > after,
                                    )
                                    .map(
                                        ({
                                            fromDid: _fromDid,
                                            ...signal
                                        }) => signal,
                                    ),
                            }
                        :   null,
                    serverTime: new Date().toISOString(),
                });
                return;
            }

            const body = request.postDataJSON() as Record<string, unknown>;
            requestBodies.push(body);
            if (path === '/location/consent') {
                if (maintenance) {
                    await fulfill(
                        {
                            error: {
                                code: 'LOCATION_EXCHANGE_DISABLED',
                                message:
                                    'Exact-location exchange is disabled during maintenance.',
                            },
                        },
                        503,
                    );
                    return;
                }
                consents.add(actorDid);
                if (
                    consents.has(requesterDid) &&
                    consents.has(helperDid) &&
                    sessionId === null
                ) {
                    sessionId =
                        '83111111-1111-4111-8111-111111111111';
                }
                const peerDid =
                    actorDid === requesterDid ? helperDid : requesterDid;
                await fulfill({
                    connectionId,
                    consent: {
                        actorConsented: true,
                        peerConsented: consents.has(peerDid),
                        freshForSeconds: 120,
                    },
                    session:
                        sessionId ?
                            {
                                id: sessionId,
                                status: sessionStatus,
                                role:
                                    actorDid === requesterDid ?
                                        'offerer'
                                    :   'answerer',
                                singleUse: true,
                                issuedAt: new Date().toISOString(),
                                expiresAt,
                                participantProof: proofs.get(actorDid),
                                expectedPeerProof: proofs.get(peerDid),
                                signals: [],
                            }
                        :   null,
                    serverTime: new Date().toISOString(),
                });
                return;
            }
            if (path === '/location/signal') {
                const kind = body['kind'] as
                    | 'description'
                    | 'candidate'
                    | 'end-of-candidates';
                const payload = body['payload'] as Record<string, unknown>;
                signals.push({
                    sequence: signals.length + 1,
                    fromDid: actorDid,
                    kind,
                    payload,
                });
                if (
                    kind === 'description' &&
                    payload['type'] === 'answer'
                ) {
                    sessionStatus = 'active';
                }
                await fulfill({
                    accepted: true,
                    sequence: signals.length,
                    status: sessionStatus,
                    expiresAt,
                });
                return;
            }
            if (path === '/location/revoke') {
                consents.clear();
                signals.length = 0;
                sessionId = null;
                sessionStatus = 'pending';
                await fulfill({
                    connectionId,
                    status: 'revoked',
                    revokedAt: new Date().toISOString(),
                });
                return;
            }
            await fulfill(
                { error: { code: 'NOT_FOUND', message: 'Not found.' } },
                404,
            );
        });
    };

    const requesterContext = await browser.newContext({
        baseURL,
        geolocation: { latitude: 41.881234, longitude: -87.632345 },
        permissions: ['geolocation'],
    });
    const helperContext = await browser.newContext({ baseURL });
    await requesterContext.addCookies([
        { name: 'patchwork_csrf', value: 'requester-csrf', url: baseURL },
    ]);
    await helperContext.addCookies([
        { name: 'patchwork_csrf', value: 'helper-csrf', url: baseURL },
    ]);
    const requesterPage = await requesterContext.newPage();
    const helperPage = await helperContext.newPage();
    await installRoutes(requesterPage, requesterDid);
    await installRoutes(helperPage, helperDid);
    await requesterPage.goto('/inbox');
    await helperPage.goto('/inbox');

    await requesterPage
        .getByRole('button', { name: 'Start private location sharing' })
        .click();
    await expect(
        requesterPage.getByText('Waiting for the other participant'),
    ).toBeVisible();
    await helperPage
        .getByRole('button', { name: 'Start private location sharing' })
        .click();
    await expect(
        requesterPage.getByText('Encrypted peer channel active'),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
        helperPage.getByText('Encrypted peer channel active'),
    ).toBeVisible({ timeout: 20_000 });

    await requesterPage
        .getByRole('button', { name: 'Share my current location' })
        .click();
    await expect(helperPage.getByText('41.881234, -87.632345')).toBeVisible();

    expect(JSON.stringify(requestBodies)).not.toMatch(
        /latitude|longitude|coordinates|streetAddress|41\.881234|-87\.632345/i,
    );

    await helperPage.reload();
    await expect(helperPage.getByText('41.881234, -87.632345')).toHaveCount(
        0,
    );
    maintenance = true;
    await helperPage
        .getByRole('button', { name: 'Start private location sharing' })
        .click();
    await expect(
        helperPage.getByText('Location sharing could not start.'),
    ).toBeVisible();

    await requesterContext.close();
    await helperContext.close();
});
