import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('outside-app deletion path is accessible and confirms before sending', async ({ page }) => {
    let signedIn = false;
    let deleted = false;
    let calls = 0;
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
        if (path === '/auth/session') return route.fulfill({ json: { session: signedIn && !deleted ? { did: 'did:plc:disposable-deletion', expiresAt: '2099-01-01T00:00:00Z' } : null } });
        if (path === '/account/delete') {
            calls++;
            expect(route.request().postDataJSON()).toMatchObject({ confirmDeletion: true });
            expect(route.request().headers()['idempotency-key']).toBeTruthy();
            deleted = true;
            return route.fulfill({ json: { status: 'deactivated' } });
        }
        return route.fulfill({ json: {} });
    });
    await page.goto('/account/delete');
    await expect(page.getByRole('heading', { name: 'Delete your Patchwork account' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in to request deletion' })).toHaveAttribute('href', '/login?returnTo=%2Faccount%2Fdelete');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    signedIn = true;
    await page.reload();
    const submit = page.getByRole('button', { name: 'Delete Patchwork account', exact: true });
    await expect(submit).toBeDisabled();
    expect(calls).toBe(0);
    await page.getByRole('checkbox').check();
    await submit.click();
    await expect(page.getByRole('status')).toContainText('deletion was accepted');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    expect(calls).toBe(1);
});
