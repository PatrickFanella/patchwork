import { expect, test } from '@playwright/test';

const requesterState = process.env['PATCHWORK_E2E_REQUESTER_STATE'];
const helperState = process.env['PATCHWORK_E2E_HELPER_STATE'];
const exactLatitude = process.env['PATCHWORK_E2E_EXACT_LATITUDE'];
const exactLongitude = process.env['PATCHWORK_E2E_EXACT_LONGITUDE'];
const privateMarker = process.env['PATCHWORK_E2E_PRIVATE_MARKER'];
const postalCode = process.env['PATCHWORK_E2E_POSTAL_CODE'] ?? '10001';
const liveEnvironmentAvailable = Boolean(
    process.env['PATCHWORK_E2E_BASE_URL'] &&
        requesterState &&
        helperState &&
        exactLatitude &&
        exactLongitude &&
        privateMarker,
);
const feedOrigin = { latitude: 40.7128, longitude: -74.006 };
const distanceFromFeedOriginKm = (latitude: number, longitude: number) => {
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const latitudeDelta = radians(latitude - feedOrigin.latitude);
    const longitudeDelta = radians(longitude - feedOrigin.longitude);
    const a =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(radians(feedOrigin.latitude)) *
            Math.cos(radians(latitude)) *
            Math.sin(longitudeDelta / 2) ** 2;
    return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

test.describe('real two-account AT record lifecycle', () => {
    test.skip(
        !liveEnvironmentAvailable,
        'Requires an authorized staging URL, two OAuth storage states, and disposable coordinates.',
    );

    test('create, discover, report, block, close, and delete without leaking private inputs', async ({
        browser,
    }) => {
        test.setTimeout(180_000);
        const latitude = Number(exactLatitude);
        const longitude = Number(exactLongitude);
        expect(Number.isFinite(latitude)).toBe(true);
        expect(Number.isFinite(longitude)).toBe(true);
        expect(distanceFromFeedOriginKm(latitude, longitude)).toBeLessThanOrEqual(
            100,
        );
        const requesterContext = await browser.newContext({
            storageState: requesterState!,
        });
        const helperContext = await browser.newContext({
            storageState: helperState!,
        });
        const requester = await requesterContext.newPage();
        const helper = await helperContext.newPage();
        const title = `Disposable alpha request ${Date.now().toString(36)}`;
        const privateDetails = privateMarker!;
        const responseBodies: string[] = [];
        for (const page of [requester, helper]) {
            page.on('response', async response => {
                if (response.request().resourceType() === 'document') return;
                const contentType = response.headers()['content-type'] ?? '';
                if (!contentType.includes('json')) return;
                responseBodies.push(await response.text().catch(() => ''));
            });
        }

        let createdPost: { uri: string; expectedCid: string } | undefined;
        try {
            const postingArea = new URLSearchParams({
                tab: 'nearby',
                r: '20000',
                lat: exactLatitude!,
                lng: exactLongitude!,
                area: 'Disposable staging area',
            });
            await requester.goto(`/posting?${postingArea.toString()}`);
            await expect(requester.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
            await requester.getByLabel('ZIP code where help is needed').fill(postalCode);
            await requester
                .getByLabel('Title', { exact: true })
                .fill(title);
            await requester
                .getByLabel('Description', { exact: true })
                .fill('Disposable integration record. No private handoff data.');
            await expect(requester.getByLabel('Latitude')).toHaveCount(0);
            await expect(requester.getByLabel('Longitude')).toHaveCount(0);
            await expect(requester.getByLabel('Precision meters')).toHaveCount(0);
            const publication = requester.waitForResponse(response =>
                response.request().method() === 'POST' &&
                new URL(response.url()).pathname === '/api/at/aid-posts',
            );
            await requester.getByRole('button', { name: 'Publish request' }).click();
            const published = await publication;
            expect(published.status()).toBe(201);
            const source = await published.json();
            expect(typeof source.uri).toBe('string');
            expect(typeof source.cid).toBe('string');
            createdPost = { uri: source.uri, expectedCid: source.cid };
            await expect(requester.getByText(/was saved, and a preview is in the Feed/)).toBeVisible();

            await helper.goto(`/feed?tab=nearby&zip=${encodeURIComponent(postalCode)}`, { waitUntil: 'networkidle' });
            await expect
                .poll(async () => {
                    await helper.reload({ waitUntil: 'networkidle' });
                    return helper.getByText(title).count();
                }, { timeout: 60_000, intervals: [2_000, 5_000, 10_000] })
                .toBe(1);
            await helper.getByRole('button', { name: new RegExp(`^Report ${title}, item \\d+ of \\d+$`) }).click();
            await helper.getByLabel('Report reason').selectOption('other');
            await helper.getByLabel('Private report details').fill(privateDetails);
            await helper.getByRole('button', { name: 'Submit report' }).click();
            await expect(helper.getByText('Report submitted.')).toBeVisible();
            await helper
                .getByRole('button', { name: new RegExp(`^Block author of ${title}, item \\d+ of \\d+$`) })
                .click();
            await helper.getByRole('button', { name: 'Confirm block author' }).click();
            await expect(helper.getByText('Author blocked.')).toBeVisible();

            await requester.goto(`/feed?tab=nearby&zip=${encodeURIComponent(postalCode)}`, { waitUntil: 'networkidle' });
            await expect
                .poll(async () => {
                    await requester.reload({ waitUntil: 'networkidle' });
                    return requester.getByText(title).count();
                }, { timeout: 60_000, intervals: [2_000, 5_000, 10_000] })
                .toBe(1);
            const resolution = requester.waitForResponse(response =>
                response.request().method() === 'POST' &&
                new URL(response.url()).pathname === '/api/aid/post/transition',
            );
            const synchronization = requester.waitForResponse(response =>
                response.request().method() === 'POST' &&
                new URL(response.url()).pathname === '/api/at/aid-posts/status/reconcile',
            ).catch(() => undefined);
            await requester
                .getByRole('button', { name: new RegExp(`^Resolve request "${title}", item \\d+ of \\d+$`) })
                .click();
            expect((await resolution).status()).toBe(200);
            const synchronized = await synchronization;
            expect(synchronized?.status()).toBe(200);
            const synchronizedPost = await synchronized!.json();
            expect(typeof synchronizedPost.cid).toBe('string');
            createdPost.expectedCid = synchronizedPost.cid;
            await expect(requester.getByText('Resolved').first()).toBeVisible();
            const closure = requester.waitForResponse(response =>
                response.request().method() === 'POST' &&
                new URL(response.url()).pathname === '/api/at/aid-posts/close',
            );
            await requester
                .getByRole('button', { name: new RegExp(`^Close ${title}, item \\d+ of \\d+$`) })
                .click();
            const closed = await (await closure).json();
            expect(typeof closed.cid).toBe('string');
            createdPost.expectedCid = closed.cid;
            await expect(requester.getByText('Request closed.')).toBeVisible();
            await requester
                .getByRole('button', { name: new RegExp(`^Delete ${title}, item \\d+ of \\d+$`) })
                .click();
            const deletion = requester.waitForResponse(response =>
                response.request().method() === 'DELETE' &&
                new URL(response.url()).pathname === '/api/at/aid-posts',
            );
            await requester
                .getByRole('button', { name: 'Confirm delete request' })
                .click();
            expect((await deletion).status()).toBe(204);
            createdPost = undefined;
            await expect(requester.getByText(title)).toHaveCount(0);

            const observable = [
                requester.url(),
                helper.url(),
                await requester.locator('body').innerText(),
                await helper.locator('body').innerText(),
                ...responseBodies,
            ].join('\n');
            expect(observable).not.toContain(exactLatitude!);
            expect(observable).not.toContain(exactLongitude!);
            expect(observable).not.toContain(privateDetails);
            expect(observable).not.toMatch(/access_token|refresh_token|id_token/i);
        } finally {
            try {
                if (createdPost) {
                    const origin = new URL(process.env['PATCHWORK_E2E_BASE_URL']!).origin;
                    const csrf = (await requesterContext.cookies(origin))
                        .find(cookie => cookie.name === 'patchwork_csrf')?.value;
                    const cleanup = await requesterContext.request.delete(`${origin}/api/at/aid-posts`, {
                        headers: {
                            Origin: origin,
                            'x-csrf-token': decodeURIComponent(csrf ?? ''),
                            'idempotency-key': crypto.randomUUID(),
                        },
                        data: createdPost,
                    });
                    expect(cleanup.status()).toBe(204);
                }
            } finally {
                await Promise.all([requesterContext.close(), helperContext.close()]);
            }
        }
    });
});
