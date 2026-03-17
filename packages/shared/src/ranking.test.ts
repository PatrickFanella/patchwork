import { describe, expect, it } from 'vitest';
import {
    computeDiscoveryRank,
    rankCardsDeterministically,
    scoreDistanceBand,
} from './ranking.js';

describe('P3.4 ranking pipeline', () => {
    it('scores distance bands deterministically', () => {
        expect(scoreDistanceBand(1.2)).toBe(1);
        expect(scoreDistanceBand(4.9)).toBe(0.82);
        expect(scoreDistanceBand(30)).toBe(0.3);
    });

    it('combines distance, recency, and trust into a stable score', () => {
        const score = computeDiscoveryRank({
            distanceKm: 2,
            createdAt: '2026-02-26T12:00:00.000Z',
            trustScore: 0.8,
            nowIso: '2026-02-26T13:00:00.000Z',
        });

        expect(score.finalScore).toBeGreaterThan(0);
        expect(score.finalScore).toBeLessThanOrEqual(1);
    });

    it('keeps tie ordering deterministic using updatedAt then URI', () => {
        const ranked = rankCardsDeterministically(
            [
                {
                    uri: 'at://did:example:z/app.patchwork.aid.post/2',
                    distanceKm: 5,
                    createdAt: '2026-02-26T10:00:00.000Z',
                    trustScore: 0.7,
                    updatedAt: '2026-02-26T12:00:00.000Z',
                },
                {
                    uri: 'at://did:example:a/app.patchwork.aid.post/1',
                    distanceKm: 5,
                    createdAt: '2026-02-26T10:00:00.000Z',
                    trustScore: 0.7,
                    updatedAt: '2026-02-26T12:00:00.000Z',
                },
            ],
            '2026-02-26T13:00:00.000Z',
        );

        expect(ranked[0]?.uri).toBe(
            'at://did:example:a/app.patchwork.aid.post/1',
        );
        expect(ranked[1]?.uri).toBe(
            'at://did:example:z/app.patchwork.aid.post/2',
        );
    });
});
