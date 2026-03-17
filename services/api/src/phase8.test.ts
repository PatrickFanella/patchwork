import { describe, expect, it } from 'vitest';
import {
    CONTRACT_VERSION,
    PHASE8_MAP_QUERY_REQUEST,
    PHASE8_NOW_ISO,
    PHASE8_PRIVACY_LOG_PAYLOAD,
    PHASE8_RANKING_CARDS,
    PHASE8_VALID_AID_POST,
    PUBLIC_MIN_PRECISION_KM,
    enforceMinimumGeoPrecisionKm,
    rankCardsDeterministically,
    recordNsid,
    redactLogData,
    safeValidateRecordPayload,
} from '@patchwork/shared';
import { createFixtureChatService } from './chat-service.js';
import { createFixtureQueryService } from './query-service.js';

describe('P8.1 API contract test matrix', () => {
    describe('schema validation', () => {
        it('validates phase 8 aid post fixture against lexicon schema', () => {
            const result = safeValidateRecordPayload(
                recordNsid.aidPost,
                PHASE8_VALID_AID_POST,
            );
            expect(result.success).toBe(true);
        });

        it('rejects an aid post missing required fields', () => {
            const result = safeValidateRecordPayload(recordNsid.aidPost, {
                $type: recordNsid.aidPost,
                version: '1.0.0',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('ranking correctness', () => {
        it('ranks phase 8 cards deterministically with closest/freshest first', () => {
            const ranked = rankCardsDeterministically(
                PHASE8_RANKING_CARDS,
                PHASE8_NOW_ISO,
            );
            expect(ranked).toHaveLength(3);
            expect(ranked[0]?.uri).toContain('rank-a');
            expect(ranked[ranked.length - 1]?.uri).toContain('rank-c');
        });

        it('produces stable scores across independent calls', () => {
            const first = rankCardsDeterministically(
                PHASE8_RANKING_CARDS,
                PHASE8_NOW_ISO,
            );
            const second = rankCardsDeterministically(
                PHASE8_RANKING_CARDS,
                PHASE8_NOW_ISO,
            );
            expect(first.map(c => c.ranking.finalScore)).toEqual(
                second.map(c => c.ranking.finalScore),
            );
        });
    });

    describe('privacy constraints', () => {
        it('enforces minimum geo precision for public queries', () => {
            const precision = enforceMinimumGeoPrecisionKm(0.1);
            expect(precision).toBeGreaterThanOrEqual(PUBLIC_MIN_PRECISION_KM);
        });

        it('redacts DID and URI sensitive fields from phase 8 log payload', () => {
            const redacted = redactLogData(
                PHASE8_PRIVACY_LOG_PAYLOAD,
            ) as Record<string, unknown>;

            expect(redacted.senderDid).toBe('did:[redacted]');
            expect(redacted.recipientDid).toBe('did:[redacted]');

            const latStr = String(redacted.latitude);
            const decimalPart = latStr.split('.')[1] ?? '';
            expect(decimalPart.length).toBeLessThanOrEqual(2);
        });

        it('query map results never expose sub-1km geo precision', () => {
            const service = createFixtureQueryService();
            const result = service.queryMap(
                new URLSearchParams({
                    latitude: String(PHASE8_MAP_QUERY_REQUEST.latitude),
                    longitude: String(PHASE8_MAP_QUERY_REQUEST.longitude),
                    radiusKm: '50',
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                results: Array<{
                    approximateGeo: { precisionKm: number };
                }>;
            };
            expect(body.results.length).toBeGreaterThan(0);
            for (const r of body.results) {
                expect(r.approximateGeo.precisionKm).toBeGreaterThanOrEqual(
                    PUBLIC_MIN_PRECISION_KM,
                );
            }
        });
    });

    describe('routing correctness', () => {
        it('initiates a deterministic conversation context from the map surface', () => {
            const service = createFixtureChatService();
            const result = service.initiateFromParams(
                new URLSearchParams({
                    aidPostUri:
                        'at://did:example:p8-alice/app.patchwork.aid.post/p8-post-map',
                    initiatedByDid: 'did:example:p8-helper',
                    recipientDid: 'did:example:p8-alice',
                    initiatedFrom: 'map',
                    now: '2026-02-27T00:10:00.000Z',
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                conversationUri: string;
                created: boolean;
            };
            expect(body.created).toBe(true);
            expect(body.conversationUri).toMatch(/^at:\/\//);
        });

        it('re-uses existing conversation for the same aid post and participants', () => {
            const service = createFixtureChatService();
            const params = new URLSearchParams({
                aidPostUri:
                    'at://did:example:p8-alice/app.patchwork.aid.post/p8-post-dedup',
                initiatedByDid: 'did:example:p8-helper',
                recipientDid: 'did:example:p8-alice',
                initiatedFrom: 'map',
                now: '2026-02-27T00:20:00.000Z',
            });

            const first = service.initiateFromParams(params);
            const second = service.initiateFromParams(params);

            expect(
                (first.body as { created: boolean }).created,
            ).toBe(true);
            expect(
                (second.body as { created: boolean }).created,
            ).toBe(false);
            expect(
                (first.body as { conversationUri: string }).conversationUri,
            ).toBe(
                (second.body as { conversationUri: string }).conversationUri,
            );
        });
    });

    describe('contract version', () => {
        it('CONTRACT_VERSION is present and matches the expected phase tag', () => {
            expect(CONTRACT_VERSION).toContain('phase9');
        });
    });
});
