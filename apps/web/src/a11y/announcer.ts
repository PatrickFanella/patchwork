/**
 * Live region announcer for screen readers.
 *
 * Creates an invisible element with aria-live that screen readers monitor
 * for dynamic content updates (route changes, filter results, etc.).
 */

const ANNOUNCER_ID = 'patchwork-a11y-announcer';

type AriaLiveLevel = 'polite' | 'assertive';

/**
 * Returns the announcer element, creating it if it does not yet exist.
 */
const getOrCreateAnnouncer = (level: AriaLiveLevel): HTMLElement => {
    const id = `${ANNOUNCER_ID}-${level}`;
    let announcer = document.getElementById(id);

    if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = id;
        announcer.setAttribute('role', 'status');
        announcer.setAttribute('aria-live', level);
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'sr-only';

        // Visually hidden styles as fallback when sr-only is not available
        announcer.style.position = 'absolute';
        announcer.style.width = '1px';
        announcer.style.height = '1px';
        announcer.style.padding = '0';
        announcer.style.margin = '-1px';
        announcer.style.overflow = 'hidden';
        announcer.style.clip = 'rect(0, 0, 0, 0)';
        announcer.style.whiteSpace = 'nowrap';
        announcer.style.borderWidth = '0';

        document.body.appendChild(announcer);
    }

    return announcer;
};

/**
 * Announces a message to screen readers via a live region.
 *
 * @param message - The message text to announce.
 * @param level - 'polite' (default, waits for idle) or 'assertive' (interrupts).
 */
export const announce = (
    message: string,
    level: AriaLiveLevel = 'polite',
): void => {
    if (typeof document === 'undefined') {
        return;
    }

    const announcer = getOrCreateAnnouncer(level);

    // Clear and re-set to ensure screen readers detect the change
    announcer.textContent = '';

    // Use requestAnimationFrame to ensure the clear is processed first
    requestAnimationFrame(() => {
        announcer.textContent = message;
    });
};

/**
 * Shorthand helpers for common live region patterns.
 */
export const ariaLive = {
    /**
     * Polite announcement (does not interrupt current speech).
     */
    polite: (message: string): void => announce(message, 'polite'),

    /**
     * Assertive announcement (interrupts current speech for urgent updates).
     */
    assertive: (message: string): void => announce(message, 'assertive'),

    /**
     * Announce a route change for SPA navigation.
     */
    routeChange: (routeName: string): void => {
        announce(`Navigated to ${routeName}`, 'polite');
    },

    /**
     * Announce the result count of a filter operation.
     */
    filterResults: (count: number, context?: string): void => {
        const contextSuffix = context ? ` for ${context}` : '';
        const plural = count === 1 ? 'result' : 'results';
        announce(`${count} ${plural} found${contextSuffix}`, 'polite');
    },
} as const;

/**
 * Removes all announcer elements from the DOM (for cleanup/testing).
 */
export const removeAnnouncers = (): void => {
    if (typeof document === 'undefined') {
        return;
    }

    for (const level of ['polite', 'assertive'] as const) {
        const element = document.getElementById(`${ANNOUNCER_ID}-${level}`);
        if (element) {
            element.remove();
        }
    }
};
