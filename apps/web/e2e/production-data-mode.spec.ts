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
