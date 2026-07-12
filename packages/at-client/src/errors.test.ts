import { describe, expect, it } from 'vitest';
import { toAtClientError } from './errors.js';

describe('OAuth error mapping', () => {
    it('maps stale callback state and denied authorization to stable codes', () => {
        expect(
            toAtClientError(new Error('OAuth state mismatch'), 'callback failed'),
        ).toMatchObject({ code: 'OAUTH_STATE_INVALID', retryable: false });
        expect(
            toAtClientError(
                Object.assign(new Error('access_denied'), { status: 400 }),
                'callback failed',
            ),
        ).toMatchObject({ code: 'OAUTH_DENIED', retryable: false });
    });
});
