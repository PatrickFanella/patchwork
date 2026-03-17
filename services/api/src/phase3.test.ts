import { describe, expect, it } from 'vitest';
import { createFixtureQueryService } from './query-service.js';

describe('api phase 3 query service', () => {
    it('returns filtered map results with deterministic pagination metadata', () => {
        const service = createFixtureQueryService();
        const result = service.queryMap(
            new URLSearchParams({
                latitude: '40.7128',
                longitude: '-74.006',
                radiusKm: '25',
                category: 'food',
                page: '1',
                pageSize: '10',
            }),
        );

        expect(result.statusCode).toBe(200);
        if ('results' in result.body) {
            expect(result.body.total).toBeGreaterThan(0);
            expect(result.body.page).toBe(1);
            expect(result.body.pageSize).toBe(10);
            expect(result.body.results[0]?.category).toBe('food');
        }
    });

    it('returns ranked feed responses using query-path ranking', () => {
        const service = createFixtureQueryService();
        const result = service.queryFeed(
            new URLSearchParams({
                latitude: '40.7128',
                longitude: '-74.006',
                radiusKm: '30',
                page: '1',
                pageSize: '2',
            }),
        );

        expect(result.statusCode).toBe(200);
        if ('results' in result.body) {
            expect(result.body.results.length).toBeGreaterThan(0);
            expect(result.body.results[0]).toHaveProperty('ranking');
        }
    });

    it('returns directory query results with status/category filters', () => {
        const service = createFixtureQueryService();
        const result = service.queryDirectory(
            new URLSearchParams({
                category: 'food-bank',
                status: 'community-verified',
                page: '1',
                pageSize: '5',
            }),
        );

        expect(result.statusCode).toBe(200);
        if (
            'results' in result.body &&
            result.body.results.length > 0 &&
            'name' in result.body.results[0]
        ) {
            expect(result.body.total).toBe(1);
            expect(result.body.results[0]?.name).toContain('Pantry');
        }
    });

    it('returns consistent validation errors for invalid filter requests', () => {
        const service = createFixtureQueryService();
        const result = service.queryMap(
            new URLSearchParams({
                latitude: 'invalid',
                longitude: '-74.006',
                radiusKm: '5',
            }),
        );

        expect(result.statusCode).toBe(400);
        expect(result.body).toMatchObject({
            error: {
                code: 'INVALID_QUERY',
            },
        });
    });
});
