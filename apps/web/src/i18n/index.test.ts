// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('browser locale detection', () => {
    afterEach(() => vi.restoreAllMocks());

    it('falls back to the browser locale when storage is unavailable', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Storage is disabled.', 'SecurityError');
        });
        const { detectBrowserLocale } = await import('./index.js');

        expect(detectBrowserLocale()).toBe('en');
    });
});
