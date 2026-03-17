/**
 * Focus management utilities for keyboard navigation and trap patterns.
 */

export const SKIP_LINK_ID = 'skip-to-main' as const;
export const MAIN_CONTENT_ID = 'main-content' as const;

/**
 * Selector for all focusable elements within a container.
 */
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable]',
].join(', ');

/**
 * Returns all focusable elements within a given container.
 */
export const getFocusableElements = (
    container: HTMLElement,
): HTMLElement[] => {
    return Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(
        element =>
            !element.hasAttribute('disabled') &&
            element.tabIndex !== -1 &&
            !element.hidden,
    );
};

/**
 * Focuses the first interactive element within a container.
 * Returns true if an element was focused, false otherwise.
 */
export const focusFirstInteractive = (container: HTMLElement): boolean => {
    const elements = getFocusableElements(container);
    if (elements.length > 0) {
        elements[0].focus();
        return true;
    }
    return false;
};

/**
 * Creates a focus trap within a container element.
 * Returns a cleanup function to remove the event listener.
 */
export const trapFocus = (container: HTMLElement): (() => void) => {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Tab') {
            return;
        }

        const focusableElements = getFocusableElements(container);
        if (focusableElements.length === 0) {
            event.preventDefault();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
            if (document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
        container.removeEventListener('keydown', handleKeyDown);
    };
};

/**
 * Saves the currently focused element and returns a function
 * that restores focus to it when called.
 */
export const restoreFocus = (): (() => void) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    return () => {
        if (
            previouslyFocused &&
            typeof previouslyFocused.focus === 'function'
        ) {
            previouslyFocused.focus();
        }
    };
};

/**
 * Handles Escape key press to close modals/drawers.
 * Returns a cleanup function.
 */
export const onEscapeKey = (
    callback: () => void,
): (() => void) => {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            callback();
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
        document.removeEventListener('keydown', handleKeyDown);
    };
};
