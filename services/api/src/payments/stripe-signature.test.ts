import { describe, expect, it } from 'vitest';
import {
    signStripePayload,
    StripeSignatureError,
    verifyStripeSignature,
} from './stripe-signature.js';

const secret = 'whsec_patchwork_test_secret';
const payload = Buffer.from('{"id":"evt_123","object":"event"}');
const now = 1_793_400_000;

const codeOf = (run: () => void): string | undefined => {
    try {
        run();
        return undefined;
    } catch (error) {
        return error instanceof StripeSignatureError ? error.code : 'OTHER';
    }
};

describe('verifyStripeSignature', () => {
    it('accepts a valid v1 signature over the exact bytes', () => {
        const header = signStripePayload(payload, secret, now);
        expect(() =>
            verifyStripeSignature({ payload, header, secret, nowSeconds: now + 10 }),
        ).not.toThrow();
    });

    it('accepts any matching v1 entry during secret rotation', () => {
        const valid = signStripePayload(payload, secret, now).split(',')[1];
        const header = `t=${now},v1=${'0'.repeat(64)},${valid},v0=ignored`;
        expect(codeOf(() =>
            verifyStripeSignature({ payload, header, secret, nowSeconds: now }),
        )).toBeUndefined();
    });

    it('rejects altered bytes, wrong secrets, and re-serialized JSON', () => {
        const header = signStripePayload(payload, secret, now);
        const reserialized = Buffer.from(JSON.stringify(JSON.parse(payload.toString()), null, 2));
        expect(codeOf(() => verifyStripeSignature({
            payload: Buffer.from(`${payload.toString()} `), header, secret, nowSeconds: now,
        }))).toBe('MISMATCH');
        expect(codeOf(() => verifyStripeSignature({
            payload, header, secret: 'whsec_other', nowSeconds: now,
        }))).toBe('MISMATCH');
        expect(codeOf(() => verifyStripeSignature({
            payload: reserialized, header, secret, nowSeconds: now,
        }))).toBe('MISMATCH');
    });

    it('rejects stale and future timestamps outside the tolerance', () => {
        const header = signStripePayload(payload, secret, now);
        expect(codeOf(() => verifyStripeSignature({
            payload, header, secret, nowSeconds: now + 301,
        }))).toBe('STALE');
        expect(codeOf(() => verifyStripeSignature({
            payload, header, secret, nowSeconds: now - 301,
        }))).toBe('STALE');
    });

    it('rejects missing, repeated, and malformed headers', () => {
        expect(codeOf(() => verifyStripeSignature({
            payload, header: undefined, secret,
        }))).toBe('MISSING');
        expect(codeOf(() => verifyStripeSignature({
            payload, header: ['t=1', 'v1=2'], secret,
        }))).toBe('MISSING');
        expect(codeOf(() => verifyStripeSignature({
            payload, header: `t=${now},v0=${'a'.repeat(64)}`, secret, nowSeconds: now,
        }))).toBe('MALFORMED');
        expect(codeOf(() => verifyStripeSignature({
            payload, header: `v1=${'a'.repeat(64)}`, secret, nowSeconds: now,
        }))).toBe('MALFORMED');
        expect(codeOf(() => verifyStripeSignature({
            payload, header: `t=${now},v1=${'a'.repeat(3000)}`, secret, nowSeconds: now,
        }))).toBe('MALFORMED');
    });
});
