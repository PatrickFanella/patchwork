import { expect, test, type Page } from '@playwright/test';

// Two accounts: one posts an offer (#135), the other asks for it. The poster
// accepts, the pair completes the handoff and records an outcome.
const giverDid = 'did:plc:browser-giver';
const askerDid = 'did:plc:browser-asker';
const offerUri = `at://${giverDid}/app.patchwork.aid.post/spare-crib`;
const now = '2026-11-09T12:00:00.000Z';
const expiresAt = '2026-11-16T12:00:00.000Z';
const offerId = '81111111-1111-4111-8111-111111111111';
const connectionId = '91111111-1111-4111-8111-111111111111';

test('a neighbor asks for an offer, the poster accepts, and the pair hands it off', async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    if (!baseURL) throw new Error('Playwright baseURL is required.');
    let published: Record<string, unknown> | undefined;
    let ask: { status: 'pending' | 'accepted'; note: string | null } | undefined;
    let connection: { status: 'active' | 'completed' } | undefined;
    let feedback: Record<string, unknown> | undefined;
    const feedQueries: string[] = [];
    const commands: Record<string, unknown>[] = [];

    const offerRow = () => ({
        uri: offerUri, cid: 'cid-offer', authorDid: giverDid, postType: 'offer',
        title: 'Spare crib', summary: 'Pick up this week.', category: 'childcare', status: 'open',
        urgency: 'low', postalCode: '60614', updatedAt: now, recordOrigin: 'visitor-created',
        approximateGeo: { latitude: 41.92, longitude: -87.65, precisionKm: 1 },
    });
    const renderAsk = (actorDid: string) => ask ? {
        id: offerId, requestUri: offerUri, postType: 'offer',
        direction: actorDid === giverDid ? 'received' : 'sent',
        note: ask.note, status: ask.status, offeredAt: now, expiresAt,
        decidedAt: ask.status === 'pending' ? null : now,
        ...(ask.status === 'accepted' ? { requesterDid: giverDid, helperDid: askerDid } : {}),
    } : undefined;
    const renderConnection = (actorDid: string) => connection ? {
        id: connectionId, offerId, requestUri: offerUri, postType: 'offer', status: connection.status,
        requesterDid: giverDid, helperDid: askerDid,
        counterpartDid: actorDid === giverDid ? askerDid : giverDid,
        acceptedAt: now, completedAt: connection.status === 'completed' ? now : null, updatedAt: now,
    } : undefined;

    const installRoutes = async (page: Page, actorDid: string) => {
        await page.route('**/api/**', async route => {
            const request = route.request();
            const url = new URL(request.url());
            const path = url.pathname.replace(/^\/api/, '');
            const reply = (body: unknown, status = 200) =>
                route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
            const body = request.method() === 'GET' ? {} : (request.postDataJSON() as Record<string, unknown>) ?? {};
            if (request.method() !== 'GET') commands.push(body);
            if (path === '/identity/handles') return reply({ handles: { [giverDid]: 'giver.example', [askerDid]: 'asker.example' } });
            if (path === '/auth/session') return reply({ session: { did: actorDid, expiresAt: '2099-01-01T00:00:00.000Z' } });
            if (path === '/account/onboarding') return reply({ policyVersion: '2026-07-28', requiredDocuments: [], consentRequired: false, acceptedAt: now });
            if (path === '/at/aid-posts' && request.method() === 'POST') {
                published = body;
                return reply({ uri: offerUri, cid: 'cid-offer', record: body }, 201);
            }
            if (path === '/query/feed') {
                feedQueries.push(url.search);
                const offers = url.searchParams.get('postType') === 'request' ? [] : [offerRow()];
                return reply({ total: offers.length, page: 1, pageSize: 20, hasNextPage: false, results: offers });
            }
            if (path === '/query/aid-post') return reply({ total: 1, results: [offerRow()] });
            if (path === '/coordination/mine') {
                const rendered = renderAsk(actorDid);
                const linked = renderConnection(actorDid);
                return reply({ pickups: [], offers: rendered ? [rendered] : [], connections: linked ? [linked] : [] });
            }
            if (path === '/inbox' && request.method() === 'GET') return reply({ items: [], unread: 0 });
            if (path === '/outcomes/mine') return reply({ feedback: feedback ? [feedback] : [] });
            if (path === '/coordination/offers') {
                // Asking for an offer needs no volunteer profile.
                ask = { status: 'pending', note: typeof body['note'] === 'string' ? body['note'] : null };
                return reply({ offer: renderAsk(actorDid) }, 201);
            }
            if (path === '/coordination/offer-decisions') {
                if (!ask || body['offerId'] !== offerId) throw new Error('Ask missing in browser state');
                ask.status = 'accepted';
                connection = { status: 'active' };
                return reply({ offer: renderAsk(actorDid), connection: renderConnection(actorDid) });
            }
            if (path === '/coordination/connections') {
                if (!connection) throw new Error('Connection missing in browser state');
                connection.status = 'completed';
                return reply({ connection: renderConnection(actorDid) });
            }
            if (path === '/outcomes') {
                feedback = { id: 'a1111111-1111-4111-8111-111111111111', connectionId, outcome: body['outcome'],
                    rating: body['rating'], comment: body['comment'] ?? null, tags: body['tags'], submittedAt: now };
                return reply({ feedback, safetyEscalated: false }, 201);
            }
            return reply({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
        });
    };

    const giverContext = await browser.newContext({ baseURL });
    const askerContext = await browser.newContext({ baseURL });
    await giverContext.addCookies([{ name: 'patchwork_csrf', value: 'giver-csrf', url: baseURL }]);
    await askerContext.addCookies([{ name: 'patchwork_csrf', value: 'asker-csrf', url: baseURL }]);
    const giver = await giverContext.newPage();
    const asker = await askerContext.newPage();
    await installRoutes(giver, giverDid);
    await installRoutes(asker, askerDid);
    const openInbox = async (page: Page) => {
        await page.goto('/inbox');
        await page.getByRole('heading', { name: 'Coordination inbox' }).waitFor();
    };

    // The poster publishes an offer: no urgency, and the record says it is an offer.
    await giver.goto('/posting?type=offer');
    await expect(giver.getByRole('heading', { name: 'Offer something' })).toBeVisible();
    await expect(giver.getByRole('radiogroup', { name: 'Urgency' })).toHaveCount(0);
    await giver.locator('#posting-zip').fill('60614');
    await giver.locator('#posting-title').fill('Spare crib');
    await giver.locator('#posting-description').fill('Pick up this week.');
    await giver.locator('#posting-category').selectOption('childcare');
    await giver.getByRole('button', { name: 'Publish offer' }).click();
    await expect.poll(() => published?.['postType']).toBe('offer');
    expect(published).toMatchObject({ urgency: 'low', location: { countryCode: 'US', postalCode: '60614' } });

    // A neighbor filters the feed to offers and finds it labeled as an offer.
    await asker.goto('/feed?type=offer');
    await expect(asker.getByRole('heading', { name: 'Spare crib' })).toBeVisible();
    await expect(asker.getByText('Offer · Childcare')).toBeVisible();
    expect(feedQueries.some(search => new URLSearchParams(search).get('postType') === 'offer')).toBe(true);

    // They ask for it from its page.
    await asker.goto(`/requests/view?uri=${encodeURIComponent(offerUri)}`);
    await expect(asker.getByRole('heading', { name: 'How to ask for it' })).toBeVisible();
    await asker.getByRole('textbox', { name: 'Why would this help, and when could you pick it up?' })
        .fill('My baby arrives next month. I can pick it up Saturday.');
    await asker.getByRole('button', { name: 'Ask for this', exact: true }).click();
    await expect(asker.getByText('Your ask was sent. You can follow it in My activity.')).toBeVisible();
    expect(commands).toContainEqual({ requestUri: offerUri, note: 'My baby arrives next month. I can pick it up Saturday.' });

    // The poster sees the ask without the asker's identity, then accepts.
    await openInbox(giver);
    const received = giver.getByRole('article', { name: 'Received ask' });
    await expect(received).toContainText('Participant identity remains private until acceptance.');
    await expect(giver.getByText('@asker.example')).toHaveCount(0);
    await received.getByRole('button', { name: 'Accept' }).click();
    await expect(giver.getByText('Connected with @asker.example')).toBeVisible();
    await expect(giver.getByText('Asked by: @asker.example')).toBeVisible();

    // The asker completes the handoff; the poster records the outcome.
    await openInbox(asker);
    await expect(asker.getByText('Connected with @giver.example')).toBeVisible();
    await asker.getByRole('button', { name: 'Complete handoff' }).click();
    await expect(asker.getByText('Record structured outcome')).toBeVisible();
    await openInbox(giver);
    await giver.getByRole('combobox', { name: 'Outcome' }).selectOption('successful');
    await giver.getByLabel('Rating').fill('5');
    await giver.getByRole('button', { name: 'Submit outcome' }).click();
    await expect(giver.getByText('Your outcome feedback is recorded.')).toBeVisible();
    expect(feedback).toMatchObject({ connectionId, outcome: 'successful', rating: 5 });

    await giverContext.close();
    await askerContext.close();
});
