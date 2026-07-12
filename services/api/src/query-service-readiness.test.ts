import { describe, expect, it } from 'vitest';
import { assessProjectionReadiness } from './query-service.js';

describe('assessProjectionReadiness', () => {
    it('requires available freshness within the configured lag limit', () => {
        expect(
            assessProjectionReadiness(
                { latestCursor: null, projectedAt: null, lagSeconds: null },
                300,
            ),
        ).toEqual({ ready: false, reason: 'Projection freshness is unavailable' });
        expect(
            assessProjectionReadiness(
                {
                    latestCursor: 10,
                    projectedAt: '2026-07-11T12:00:00.000Z',
                    lagSeconds: 301,
                },
                300,
            ),
        ).toEqual({
            ready: false,
            reason: 'Projection lag exceeds 300 seconds',
        });
        expect(
            assessProjectionReadiness(
                {
                    latestCursor: 10,
                    projectedAt: '2026-07-11T12:00:00.000Z',
                    lagSeconds: 300,
                },
                300,
            ),
        ).toEqual({ ready: true });
    });
});
