import { describe, expect, it } from 'vitest';
import { toErrorHttpResult } from './http-error.js';

describe('http error helper', () => {
    it('builds stable error response payloads with optional details', () => {
        expect(toErrorHttpResult(400, 'INVALID_INPUT', 'bad request')).toEqual({
            statusCode: 400,
            body: {
                error: {
                    code: 'INVALID_INPUT',
                    message: 'bad request',
                    details: undefined,
                },
            },
        });

        expect(
            toErrorHttpResult(403, 'UNAUTHORIZED', 'nope', {
                field: 'token',
            }),
        ).toEqual({
            statusCode: 403,
            body: {
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'nope',
                    details: {
                        field: 'token',
                    },
                },
            },
        });
    });
});
