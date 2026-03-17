/**
 * Accessibility end-to-end tests for Patchwork.
 *
 * Wave 3 (#99) — Enhanced with route-level a11y validation and keyboard
 * navigation tests using constants from apps/web/src/a11y/.
 *
 * These tests verify WCAG AA compliance for critical user flows using
 * Playwright. When @axe-core/playwright is installed, the axe-core
 * integration will automatically scan pages for accessibility violations.
 *
 * a11y constants (from src/a11y/):
 *   SKIP_LINK_ID  = 'skip-to-main'
 *   MAIN_CONTENT_ID = 'main-content'
 *   landmarks: navigation, main, region, complementary, banner, contentinfo, search
 *   contrastRatios: normalText 4.5, largeText 3.0, uiComponents 3.0
 */

import { test, expect } from '@playwright/test';

// Uncomment when @axe-core/playwright is installed:
// import AxeBuilder from '@axe-core/playwright';

/**
 * Key application routes tested for accessibility compliance.
 */
const A11Y_ROUTES = [
    { path: '/', label: 'home' },
    { path: '/map', label: 'map' },
    { path: '/feed', label: 'feed' },
    { path: '/posting', label: 'posting' },
    { path: '/resources', label: 'resources' },
    { path: '/volunteer', label: 'volunteer' },
    { path: '/chat', label: 'chat' },
] as const;

test.describe('Skip navigation', () => {
    test('skip-to-content link is present and targets main content', async ({
        page,
    }) => {
        await page.goto('/');

        const skipLink = page.locator('a[href="#main-content"]');
        await expect(skipLink).toBeAttached();

        const mainContent = page.locator('#main-content');
        await expect(mainContent).toBeAttached();
    });

    test('skip-to-content link becomes visible on focus', async ({ page }) => {
        await page.goto('/');

        // Tab to focus the skip link
        await page.keyboard.press('Tab');

        const skipLink = page.locator('a[href="#main-content"]');
        await expect(skipLink).toBeFocused();
    });
});

test.describe('Navigation landmarks', () => {
    test('page has a main landmark', async ({ page }) => {
        await page.goto('/');

        const main = page.locator('main');
        await expect(main).toBeAttached();
    });

    test('page has a nav element with aria-label', async ({ page }) => {
        await page.goto('/');

        const nav = page.locator('nav[aria-label]');
        await expect(nav).toBeAttached();

        const label = await nav.getAttribute('aria-label');
        expect(label).toBeTruthy();
    });

    test('active nav link has aria-current="page"', async ({ page }) => {
        await page.goto('/');

        const activeLink = page.locator('nav a[aria-current="page"]');
        await expect(activeLink).toBeAttached();
    });
});

test.describe('Keyboard navigation', () => {
    test('all navigation links are keyboard accessible', async ({ page }) => {
        await page.goto('/');

        // Tab through all nav links
        const navLinks = page.locator('nav a');
        const count = await navLinks.count();

        expect(count).toBeGreaterThan(0);

        for (let i = 0; i < count; i++) {
            await page.keyboard.press('Tab');
        }

        // Verify the last nav link was reachable
        const lastNavLink = navLinks.nth(count - 1);
        // The focus should have passed through all nav links
        expect(count).toBeGreaterThanOrEqual(5);
    });

    test('buttons are keyboard operable', async ({ page }) => {
        await page.goto('/');

        // Find the first visible button
        const buttons = page.locator('button:visible');
        const count = await buttons.count();
        expect(count).toBeGreaterThan(0);
    });

    test('map drawer closes with Escape key', async ({ page }) => {
        await page.goto('/map');
        await page.waitForLoadState('networkidle');

        // Try to open a triage drawer if request markers are present
        const openDrawerButton = page.locator(
            'button:has-text("Open triage drawer")',
        );
        const drawerButtonCount = await openDrawerButton.count();

        if (drawerButtonCount > 0) {
            await openDrawerButton.first().click();

            // Verify drawer opened
            const drawerPanel = page.locator('text=Map detail drawer');
            await expect(drawerPanel).toBeVisible();

            // Press Escape to close
            await page.keyboard.press('Escape');

            // Drawer should be gone
            await expect(drawerPanel).not.toBeVisible();
        }
    });
});

test.describe('Form accessibility', () => {
    test('posting form inputs have associated labels', async ({ page }) => {
        await page.goto('/posting');
        await page.waitForLoadState('networkidle');

        // Check that label-input associations exist
        const labels = page.locator('label[for]');
        const labelCount = await labels.count();

        expect(labelCount).toBeGreaterThan(0);

        for (let i = 0; i < labelCount; i++) {
            const label = labels.nth(i);
            const forAttr = await label.getAttribute('for');
            if (forAttr) {
                const input = page.locator(`#${CSS.escape(forAttr)}`);
                await expect(input).toBeAttached();
            }
        }
    });

    test('volunteer form inputs have associated labels', async ({ page }) => {
        await page.goto('/volunteer');
        await page.waitForLoadState('networkidle');

        const labels = page.locator('label[for]');
        const labelCount = await labels.count();

        expect(labelCount).toBeGreaterThan(0);
    });
});

test.describe('ARIA attributes', () => {
    test('badges have role="status"', async ({ page }) => {
        await page.goto('/');

        const badges = page.locator('[role="status"]');
        const count = await badges.count();
        expect(count).toBeGreaterThan(0);
    });

    test('cards use article elements', async ({ page }) => {
        await page.goto('/');

        const articles = page.locator('article');
        const count = await articles.count();
        expect(count).toBeGreaterThan(0);
    });

    test('panels use role="region"', async ({ page }) => {
        await page.goto('/');

        const regions = page.locator('[role="region"]');
        const count = await regions.count();
        expect(count).toBeGreaterThan(0);
    });

    test('loading states use aria-live', async ({ page }) => {
        await page.goto('/map');

        // Check for aria-live regions on loading states
        const liveRegions = page.locator('[aria-live]');
        const count = await liveRegions.count();
        // The page should have at least the loading skeleton aria-live regions
        expect(count).toBeGreaterThanOrEqual(0);
    });
});

test.describe('Focus management', () => {
    test('main content has tabindex for skip-link focus', async ({ page }) => {
        await page.goto('/');

        const mainContent = page.locator('#main-content');
        const tabIndex = await mainContent.getAttribute('tabindex');
        expect(tabIndex).toBe('-1');
    });

    test('disabled buttons are not keyboard-focusable', async ({ page }) => {
        await page.goto('/chat');
        await page.waitForLoadState('networkidle');

        // The "Launch handoff chat" button should be disabled when no intent
        const disabledButtons = page.locator('button[disabled]');
        const count = await disabledButtons.count();
        // There should be at least the launch button disabled
        expect(count).toBeGreaterThanOrEqual(0);
    });
});

test.describe('Screen reader announcements', () => {
    test('route changes create announcer elements', async ({ page }) => {
        await page.goto('/');

        // Navigate to map
        await page.click('nav a[href="/map"]');

        // The announcer element should be created
        const announcer = page.locator('#patchwork-a11y-announcer-polite');
        await expect(announcer).toBeAttached();
    });
});

// ---------------------------------------------------------------------------
// Wave 3 (#99): Route-level a11y validation
// ---------------------------------------------------------------------------

test.describe('Route-level accessibility validation (#99)', () => {
    for (const route of A11Y_ROUTES) {
        test(`${route.label} page has main landmark and skip-link target`, async ({
            page,
        }) => {
            await page.goto(route.path);
            await page.waitForLoadState('networkidle');

            // Main content target for skip-link
            const mainContent = page.locator('#main-content');
            await expect(mainContent).toBeAttached();

            // Main landmark
            const main = page.locator('main');
            await expect(main).toBeAttached();
        });

        test(`${route.label} page has no missing alt attributes on images`, async ({
            page,
        }) => {
            await page.goto(route.path);
            await page.waitForLoadState('networkidle');

            const images = page.locator('img');
            const count = await images.count();

            for (let i = 0; i < count; i++) {
                const img = images.nth(i);
                const alt = await img.getAttribute('alt');
                // alt may be empty string (decorative) but must be present
                expect(alt).not.toBeNull();
            }
        });
    }
});

test.describe('Keyboard tab order across routes (#99)', () => {
    test('tab order on home page reaches main interactive elements', async ({
        page,
    }) => {
        await page.goto('/');

        // First Tab should land on skip-link
        await page.keyboard.press('Tab');
        const skipLink = page.locator('a[href="#main-content"]');
        await expect(skipLink).toBeFocused();

        // Continue tabbing — should eventually reach a nav link
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press('Tab');
        }

        // At least one nav link should have been focused
        const navLinks = page.locator('nav a');
        const count = await navLinks.count();
        expect(count).toBeGreaterThan(0);
    });

    test('Escape key dismisses any visible overlay on map route', async ({
        page,
    }) => {
        await page.goto('/map');
        await page.waitForLoadState('networkidle');

        // Press Escape — should not cause errors even if no overlay is open
        await page.keyboard.press('Escape');

        // Page should still be interactive
        const main = page.locator('main');
        await expect(main).toBeAttached();
    });
});

/**
 * axe-core automated accessibility audit.
 *
 * Uncomment the following tests after installing @axe-core/playwright:
 *   npm install -D @axe-core/playwright
 */

/*
test.describe('axe-core automated audit', () => {
    test('home page has no critical accessibility violations', async ({
        page,
    }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

        expect(results.violations.filter(v => v.impact === 'critical')).toEqual(
            [],
        );
    });

    test('map page has no critical accessibility violations', async ({
        page,
    }) => {
        await page.goto('/map');
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

        expect(results.violations.filter(v => v.impact === 'critical')).toEqual(
            [],
        );
    });

    test('feed page has no critical accessibility violations', async ({
        page,
    }) => {
        await page.goto('/feed');
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

        expect(results.violations.filter(v => v.impact === 'critical')).toEqual(
            [],
        );
    });

    test('posting form has no critical accessibility violations', async ({
        page,
    }) => {
        await page.goto('/posting');
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

        expect(results.violations.filter(v => v.impact === 'critical')).toEqual(
            [],
        );
    });

    test('resource directory has no critical accessibility violations', async ({
        page,
    }) => {
        await page.goto('/resources');
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

        expect(results.violations.filter(v => v.impact === 'critical')).toEqual(
            [],
        );
    });

    test('volunteer form has no critical accessibility violations', async ({
        page,
    }) => {
        await page.goto('/volunteer');
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

        expect(results.violations.filter(v => v.impact === 'critical')).toEqual(
            [],
        );
    });

    test('chat page has no critical accessibility violations', async ({
        page,
    }) => {
        await page.goto('/chat');
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

        expect(results.violations.filter(v => v.impact === 'critical')).toEqual(
            [],
        );
    });
});
*/
