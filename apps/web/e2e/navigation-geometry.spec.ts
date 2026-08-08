import { expect, test } from '@playwright/test';

const widths = [320, 360, 390, 768, 1024] as const;

for (const width of widths) {
    test(`primary navigation remains reachable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');

        const geometry = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            content: document.documentElement.scrollWidth,
        }));
        expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);

        const toggle = page.getByRole('button', { name: /more/i });
        if (width <= 900) {
            await expect(toggle).toBeVisible();
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            const mapLink = page.getByRole('link', { name: /map/i }).first();
            await expect(mapLink).toBeVisible();
            await mapLink.click();
            await expect(page).toHaveURL(/\/map/);
        } else {
            await expect(page.getByRole('link', { name: /map/i }).first()).toBeVisible();
        }
    });
}

test('mobile navigation closes on Escape and restores focus to its toggle', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /more/i });
    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
});
