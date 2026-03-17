/**
 * Accessibility constants and re-exports for the Patchwork application.
 *
 * WCAG AA compliance targets:
 * - Color contrast ratio: >= 4.5:1 for normal text, >= 3:1 for large text
 * - Focus indicators: visible and >= 2px outline
 * - Keyboard: all interactive elements reachable via Tab, operable via Enter/Space
 * - Screen readers: landmarks, roles, labels, and live regions used consistently
 */

export { ariaLive, announce } from './announcer';
export {
    buildAriaLabel,
    buildAriaDescribedBy,
    srOnly,
    visuallyHidden,
} from './aria-utils';
export {
    trapFocus,
    restoreFocus,
    focusFirstInteractive,
    SKIP_LINK_ID,
    MAIN_CONTENT_ID,
} from './focus-management';

/**
 * Standard landmark roles used across the application.
 */
export const landmarks = {
    navigation: 'navigation',
    main: 'main',
    region: 'region',
    complementary: 'complementary',
    banner: 'banner',
    contentinfo: 'contentinfo',
    search: 'search',
} as const;

/**
 * WCAG AA minimum contrast ratios for verification.
 */
export const contrastRatios = {
    normalText: 4.5,
    largeText: 3.0,
    uiComponents: 3.0,
} as const;
