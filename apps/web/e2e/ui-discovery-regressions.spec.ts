import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const resource = {
    uri: 'at://did:plc:public-resource/app.patchwork.directory.resource/clinic',
    authorDid: 'did:plc:public-resource',
    name: 'Neighborhood WIC clinic',
    category: 'clinic',
    serviceArea: 'Chicago, IL 60608',
    status: 'unverified',
    operationalStatus: 'unknown',
    recordOrigin: 'sourced-public',
    approximateGeo: { latitude: 41.85, longitude: -87.67, precisionKm: 1 },
    contact: { url: 'https://example.org/wic' },
    openHours: 'Tuesday by appointment',
    eligibilityNotes: 'Call before visiting.',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
};

test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/query/directory') || path.endsWith('/query/directory-resource')) {
            return route.fulfill({ json: { results: [resource], total: 1, page: 1, pageSize: 20, hasNextPage: false } });
        }
        if (path.endsWith('/query/feed')) {
            return route.fulfill({ json: { results: [], total: 0, page: 1, pageSize: 20, hasNextPage: false } });
        }
        if (path.endsWith('/query/resource-map')) {
            return route.fulfill({ json: { cells: [], total: 1, mapped: 0 } });
        }
        return route.fulfill({ status: 401, json: { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in.' } } });
    });
});

test('home search preserves word boundaries and submits with Enter', async ({ page }) => {
    await page.goto('/?zip=60608&r=5000');
    const search = page.getByRole('textbox', { name: 'Search requests', exact: true });
    await search.pressSequentially('rent assistance');
    await expect(search).toHaveValue('rent assistance');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/map\?/);
    const query = new URL(page.url()).searchParams;
    expect(query.get('q')).toBe('rent assistance');
    expect(query.get('zip')).toBe('60608');
    expect(query.get('r')).toBe('5000');
});

test('home discloses the preview area and keeps a chosen ZIP on map navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Chicago is the default preview area.', { exact: false })).toBeVisible();
    await expect(page.getByText('Public-source reference', { exact: true })).toBeVisible();
    await page.getByText('Change area', { exact: true }).click();
    await page.getByLabel('ZIP code', { exact: true }).fill('60187');
    await page.getByRole('button', { name: 'Find area', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Near ZIP 60187' })).toBeVisible();
    await page.getByRole('button', { name: "See what's nearby", exact: true }).click();
    await expect(page).toHaveURL(/\/map\?/);
    expect(new URL(page.url()).searchParams.get('zip')).toBe('60187');
});

for (const width of [390, 1280]) {
    test(`directory shows results before expanded filters at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/resources');
        const card = page.getByRole('article').filter({ hasText: resource.name });
        await expect(card).toBeVisible();
        await expect(page.locator('.mh-resource-filter-disclosure')).not.toHaveAttribute('open');
        const bounds = await card.boundingBox();
        expect(bounds!.y).toBeLessThan(700);
        await page.locator('.mh-resource-filter-disclosure > summary').click();
        await expect(page.getByLabel('What do you need?', { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
}

test('resource context survives the card action, sign-in and restored posting page', async ({ page }) => {
    await page.goto('/resources?zip=60608');
    await page.getByRole('link', { name: `Ask the community about ${resource.name}`, exact: true }).click();
    await expect(page.getByText(`Community request about ${resource.name}`, { exact: true })).toBeVisible();
    const postingUrl = page.url();
    expect(new URL(postingUrl).searchParams.get('resource')).toBe(resource.uri);
    await page.getByRole('link', { name: 'Sign in to continue', exact: true }).click();
    const returnTo = new URL(page.url()).searchParams.get('returnTo')!;
    expect(new URL(returnTo, 'http://localhost').searchParams.get('resource')).toBe(resource.uri);
    expect(new URL(returnTo, 'http://localhost').searchParams.get('resourceName')).toBe(resource.name);
    await page.route('**/api/auth/session', route => route.fulfill({ json: { session: { did: 'did:plc:neighbor', expiresAt: '2099-01-01T00:00:00Z' } } }));
    await page.route('**/api/account/onboarding', route => route.fulfill({ json: { policyVersion: '2026-07-28', consentRequired: false, requiredDocuments: [], acceptedAt: '2026-09-05T12:00:00Z' } }));
    await page.goto(returnTo);
    await expect(page.getByRole('textbox', { name: 'ZIP code where help is needed', exact: true })).toBeVisible();
    await expect(page.getByText(`Community request about ${resource.name}`, { exact: true })).toBeVisible();
    await expect(page.getByText('Your request goes to the Patchwork community.', { exact: false })).toBeVisible();
});

test('a failed map module leaves navigation and the mobile result list usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/assets/ResourceMap-*.js', route => route.abort('failed'));
    await page.goto('/map?zip=60608');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('The basemap is unavailable.');
    await alert.getByRole('button', { name: 'List', exact: true }).click();
    await page.locator('.pw-explorer__result').click();
    await expect(page.getByRole('dialog')).toContainText(resource.name);
    await page.keyboard.press('Escape');
    await expect(page.locator('.pw-explorer__result')).toBeFocused();
    await page.locator('.mh-tabbar').getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A little help, from a friend.');
});

test('the sign-in input boundary contrasts with its panel', async ({ page }) => {
    await page.goto('/login');
    const colors = await page.getByLabel('Your handle', { exact: true }).evaluate(element => {
        const style = getComputedStyle(element);
        return [style.borderTopColor, style.backgroundColor];
    });
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
        .map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const [border, fill] = colors.map(luminance);
    expect((Math.max(border, fill) + .05) / (Math.min(border, fill) + .05)).toBeGreaterThanOrEqual(3);
});
