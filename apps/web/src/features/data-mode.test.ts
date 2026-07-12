import { describe, expect, it } from 'vitest';
import { resolveWebDataMode } from './data-mode.js';

describe('web data mode', () => {
    it('allows explicit local fixture demos but rejects fixture production builds', () => {
        expect(resolveWebDataMode({}, { command: 'serve', mode: 'development' })).toBe(
            'api',
        );
        expect(
            resolveWebDataMode(
                { VITE_DATA_MODE: 'fixture' },
                { command: 'serve', mode: 'development' },
            ),
        ).toBe('fixture');
        expect(() =>
            resolveWebDataMode(
                { VITE_DATA_MODE: 'fixture' },
                { command: 'build', mode: 'production' },
            ),
        ).toThrow('VITE_DATA_MODE=fixture is forbidden in production builds');
        expect(() =>
            resolveWebDataMode(
                { VITE_DATA_MODE: 'fixture' },
                { command: 'build', mode: 'staging' },
            ),
        ).toThrow('VITE_DATA_MODE=fixture is forbidden in production builds');
        expect(
            resolveWebDataMode(
                { VITE_DATA_MODE: 'fixture' },
                { command: 'build', mode: 'development' },
            ),
        ).toBe('fixture');
    });
});
