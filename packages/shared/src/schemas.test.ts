import { describe, expect, it } from 'vitest';
import {
    atUriRecordSchema,
    atUriSchema,
    didSchema,
    isoDateTimeSchema,
} from './schemas.js';

describe('shared schemas', () => {
    it('parses valid did and at uri values', () => {
        expect(didSchema.parse('did:example:alice')).toBe('did:example:alice');
        expect(
            atUriSchema.parse(
                'at://did:example:alice/app.patchwork.aid.post/post-1',
            ),
        ).toBe('at://did:example:alice/app.patchwork.aid.post/post-1');
        expect(
            atUriRecordSchema.parse(
                'at://did:example:alice/app.patchwork.aid.post/post-1',
            ),
        ).toBe('at://did:example:alice/app.patchwork.aid.post/post-1');
    });

    it('rejects invalid values', () => {
        expect(() => didSchema.parse('not-a-did')).toThrowError();
        expect(() => atUriSchema.parse('https://example.com')).toThrowError();
        expect(() =>
            atUriRecordSchema.parse('at://did:example:alice'),
        ).toThrowError();
        expect(() => isoDateTimeSchema.parse('2026-02-26')).toThrowError();
    });
});
