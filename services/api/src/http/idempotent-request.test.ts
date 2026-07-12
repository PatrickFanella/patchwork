import { describe, expect, it } from 'vitest';
import {
    idempotencyKeyFromRequest,
    withIdempotencyKey,
} from './idempotent-request.js';

describe('idempotent HTTP request', () => {
    it('requires a bounded header and overwrites hostile body command IDs', () => {
        expect(
            idempotencyKeyFromRequest({
                headers: { 'idempotency-key': 'browser-command-1' },
            }),
        ).toBe('browser-command-1');
        expect(
            withIdempotencyKey(
                { commandId: 'hostile-body', value: 1 },
                'browser-command-1',
            ),
        ).toEqual({ commandId: 'browser-command-1', value: 1 });
        expect(() =>
            idempotencyKeyFromRequest({ headers: {} }),
        ).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REQUIRED' }));
    });
});
