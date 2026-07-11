import { describe, expect, it } from 'vitest';
import { createMethodRouter } from './router.js';

describe('method-aware HTTP router', () => {
    it('distinguishes an unknown path from an unsupported method', () => {
        const read = () => 'read';
        const update = () => 'update';
        const router = createMethodRouter([
            { method: 'GET', pathname: '/resource', handler: read },
            { method: 'PATCH', pathname: '/resource', handler: update },
        ]);

        expect(router.resolve('GET', '/resource')).toEqual({
            kind: 'matched',
            handler: read,
        });
        expect(router.resolve('DELETE', '/resource')).toEqual({
            kind: 'method-not-allowed',
            allow: ['GET', 'PATCH'],
        });
        expect(router.resolve('GET', '/missing')).toEqual({
            kind: 'not-found',
        });
    });
});
