import { expect, test } from '@playwright/test';

const requesterState = process.env['PATCHWORK_E2E_REQUESTER_STATE'];
const helperState = process.env['PATCHWORK_E2E_HELPER_STATE'];
const exactLatitude = process.env['PATCHWORK_E2E_EXACT_LATITUDE'];
const exactLongitude = process.env['PATCHWORK_E2E_EXACT_LONGITUDE'];
const privateMarker = process.env['PATCHWORK_E2E_PRIVATE_MARKER'];
const liveEnvironmentAvailable = Boolean(
    process.env['PATCHWORK_E2E_BASE_URL'] &&
        requesterState &&
        helperState &&
        exactLatitude &&
        exactLongitude &&
        privateMarker,
);

test.describe('real two-account AT record lifecycle', () => {
    test.skip(
        !liveEnvironmentAvailable,
        'Requires an authorized staging URL, two OAuth storage states, and disposable coordinates.',
    );

    test('create, discover, report, block, close, and delete without leaking private inputs', async ({
        browser,
    }) => {
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

        await requester.goto('/posting');
        await expect(requester.getByText(/did:/).first()).toBeVisible();
        await requester.getByLabel('Title').fill(title);
        await requester
            .getByLabel('Description')
            .fill('Disposable integration record. No private handoff data.');
        await requester.getByLabel('Latitude').fill(exactLatitude!);
        await requester.getByLabel('Longitude').fill(exactLongitude!);
        await requester.getByLabel('Precision meters').fill('1000');
        await requester.getByRole('button', { name: 'Publish request' }).click();
        await expect(requester.getByText(/persisted via API\/DB/)).toBeVisible();

        await helper.goto('/feed');
        await expect
            .poll(async () => {
                await helper.reload();
                return helper.getByText(title).count();
            }, { timeout: 60_000 })
            .toBe(1);
        await helper.getByRole('button', { name: `Report ${title}` }).click();
        await helper.getByLabel('Report reason').selectOption('other');
        await helper.getByLabel('Private report details').fill(privateDetails);
        await helper.getByRole('button', { name: 'Submit report' }).click();
        await expect(helper.getByText('Report submitted.')).toBeVisible();
        await helper
            .getByRole('button', { name: `Block author of ${title}` })
            .click();
        await helper.getByRole('button', { name: 'Confirm block author' }).click();
        await expect(helper.getByText('Author blocked.')).toBeVisible();

        await requester.goto('/feed');
        await expect
            .poll(async () => {
                await requester.reload();
                return requester.getByText(title).count();
            }, { timeout: 60_000 })
            .toBe(1);
        await requester
            .getByRole('button', { name: `Close ${title.toLowerCase()}` })
            .click();
        await expect(requester.getByText('Request closed.')).toBeVisible();
        await requester
            .getByRole('button', { name: `Delete ${title.toLowerCase()}` })
            .click();
        await requester
            .getByRole('button', { name: 'Confirm delete request' })
            .click();
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

        await requesterContext.close();
        await helperContext.close();
    });
});
