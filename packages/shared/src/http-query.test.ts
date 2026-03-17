import { describe, expect, it } from 'vitest';
import { readQueryString, requireQueryString } from './http-query.js';

describe('http query helpers', () => {
    it('reads non-empty query values and trims empty values to undefined', () => {
        const params = new URLSearchParams({
            name: 'alice',
            blank: '   ',
        });

        expect(readQueryString(params, 'name')).toBe('alice');
        expect(readQueryString(params, 'blank')).toBeUndefined();
        expect(readQueryString(params, 'missing')).toBeUndefined();
    });

    it('requires values and throws provided error for missing keys', () => {
        const params = new URLSearchParams({
            ok: 'yes',
        });

        expect(
            requireQueryString(
                params,
                'ok',
                key => new Error(`missing:${key}`),
            ),
        ).toBe('yes');

        expect(() =>
            requireQueryString(
                params,
                'missing',
                key => new Error(`missing:${key}`),
            ),
        ).toThrowError('missing:missing');
    });

    it('throws provided error for present-but-blank values', () => {
        const params = new URLSearchParams({ blank: '   ' });

        expect(() =>
            requireQueryString(
                params,
                'blank',
                key => new Error(`missing:${key}`),
            ),
        ).toThrowError('missing:blank');
    });
});
