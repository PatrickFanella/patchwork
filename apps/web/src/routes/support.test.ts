import { describe, expect, it } from 'vitest';
import { parseDollarsToMinor } from './support';

describe('parseDollarsToMinor', () => {
    it.each([
        ['25', 2_500],
        ['25.5', 2_550],
        ['25.05', 2_505],
        ['$10', 1_000],
        [' 1 ', 100],
        ['10000', 1_000_000],
    ])('reads %j as %i cents', (input, expected) => {
        expect(parseDollarsToMinor(input)).toBe(expected);
    });

    it.each(['', 'abc', '1.234', '-5', '1e3', '1,000', '123456', '.50', '5.'])(
        'rejects %j',
        (input) => {
            expect(parseDollarsToMinor(input)).toBeUndefined();
        },
    );
});
