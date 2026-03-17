/**
 * Helper functions for building ARIA attributes consistently.
 */

/**
 * Builds an aria-label string from parts, filtering out empty/undefined values.
 */
export const buildAriaLabel = (
    ...parts: (string | undefined | null)[]
): string => {
    return parts.filter(Boolean).join(', ');
};

/**
 * Builds an aria-describedby value from one or more element IDs,
 * filtering out undefined/empty values.
 */
export const buildAriaDescribedBy = (
    ...ids: (string | undefined | null)[]
): string | undefined => {
    const filtered = ids.filter(
        (id): id is string => Boolean(id) && id!.trim().length > 0,
    );
    return filtered.length > 0 ? filtered.join(' ') : undefined;
};

/**
 * CSS class name for visually hidden but screen-reader accessible content.
 * Tailwind's sr-only class equivalent.
 */
export const srOnly = 'sr-only' as const;

/**
 * Inline style object for visually hidden elements when Tailwind is not available.
 */
export const visuallyHidden: Readonly<Record<string, string>> = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: '0',
} as const;

/**
 * Returns proper aria-current value for navigation items.
 */
export const ariaCurrent = (
    isActive: boolean,
): 'page' | undefined => {
    return isActive ? 'page' : undefined;
};

/**
 * Returns aria-pressed for toggle buttons.
 */
export const ariaPressed = (
    isPressed: boolean,
): 'true' | 'false' => {
    return isPressed ? 'true' : 'false';
};

/**
 * Returns aria-expanded for collapsible sections.
 */
export const ariaExpanded = (
    isExpanded: boolean,
): 'true' | 'false' => {
    return isExpanded ? 'true' : 'false';
};

/**
 * Generates a unique ID for associating labels with form controls.
 */
let idCounter = 0;
export const generateAriaId = (prefix: string): string => {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
};

/**
 * Resets the ID counter (for testing).
 */
export const resetAriaIdCounter = (): void => {
    idCounter = 0;
};
