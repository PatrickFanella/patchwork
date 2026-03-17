import { describe, expect, it } from 'vitest';
import { APP_TITLE } from './App';

describe('web shell', () => {
    it('exposes app title constant', () => {
        expect(APP_TITLE).toBe('Patchwork');
    });
});
