import { describe, expect, it } from 'vitest';
import { toPublicError } from './error-response.js';

describe('public HTTP errors', () => {
    it('never exposes internal exception details', () => {
        expect(
            toPublicError(new Error('database password appeared here'), 'request-1'),
        ).toEqual({
            statusCode: 500,
            body: {
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'The server could not complete the request.',
                    requestId: 'request-1',
                },
            },
        });
    });
});
