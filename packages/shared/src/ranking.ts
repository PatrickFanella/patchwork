import { z } from 'zod';

export const RANKING_WEIGHTS = {
    distanceBand: 0.45,
    recency: 0.35,
    trust: 0.2,
} as const;

export const DISTANCE_BANDS = [
    { maxKm: 2, score: 1 },
    { maxKm: 5, score: 0.82 },
    { maxKm: 10, score: 0.66 },
    { maxKm: 25, score: 0.48 },
    { maxKm: Number.POSITIVE_INFINITY, score: 0.3 },
] as const;

export const RECENCY_HALF_LIFE_HOURS = 24;

const trustScoreSchema = z.number().min(0).max(1);

export interface RankingBreakdown {
    distanceBandScore: number;
    recencyScore: number;
    trustScore: number;
    finalScore: number;
}

export interface RankInput {
    distanceKm: number;
    createdAt: string;
    trustScore: number;
    nowIso: string;
}

export interface RankableCard {
    uri: string;
    distanceKm: number;
    createdAt: string;
    trustScore: number;
    updatedAt: string;
}

const roundScore = (value: number): number => Number(value.toFixed(6));

export const scoreDistanceBand = (distanceKm: number): number => {
    for (const band of DISTANCE_BANDS) {
        if (distanceKm <= band.maxKm) {
            return band.score;
        }
    }

    return DISTANCE_BANDS[DISTANCE_BANDS.length - 1].score;
};

export const scoreRecency = (createdAt: string, nowIso: string): number => {
    const createdMs = new Date(createdAt).getTime();
    const nowMs = new Date(nowIso).getTime();

    if (!Number.isFinite(createdMs) || !Number.isFinite(nowMs)) {
        return 0;
    }

    const ageHours = Math.max(0, (nowMs - createdMs) / 3_600_000);
    const decay = Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);
    return roundScore(decay);
};

export const computeDiscoveryRank = (input: RankInput): RankingBreakdown => {
    const distanceBandScore = scoreDistanceBand(input.distanceKm);
    const recencyScore = scoreRecency(input.createdAt, input.nowIso);
    const trustScore = trustScoreSchema.parse(input.trustScore);

    const finalScore =
        distanceBandScore * RANKING_WEIGHTS.distanceBand +
        recencyScore * RANKING_WEIGHTS.recency +
        trustScore * RANKING_WEIGHTS.trust;

    return {
        distanceBandScore: roundScore(distanceBandScore),
        recencyScore: roundScore(recencyScore),
        trustScore: roundScore(trustScore),
        finalScore: roundScore(finalScore),
    };
};

export const rankCardsDeterministically = <T extends RankableCard>(
    cards: readonly T[],
    nowIso: string,
): Array<T & { ranking: RankingBreakdown }> => {
    const enriched = cards.map(card => ({
        ...card,
        ranking: computeDiscoveryRank({
            distanceKm: card.distanceKm,
            createdAt: card.createdAt,
            trustScore: card.trustScore,
            nowIso,
        }),
    }));

    return [...enriched].sort((left, right) => {
        if (right.ranking.finalScore !== left.ranking.finalScore) {
            return right.ranking.finalScore - left.ranking.finalScore;
        }

        const rightUpdated = new Date(right.updatedAt).getTime();
        const leftUpdated = new Date(left.updatedAt).getTime();
        if (rightUpdated !== leftUpdated) {
            return rightUpdated - leftUpdated;
        }

        return left.uri.localeCompare(right.uri);
    });
};
