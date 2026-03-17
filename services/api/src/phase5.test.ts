import { describe, expect, it } from 'vitest';
import { createFixtureChatService } from './chat-service.js';

describe('api phase 5 chat service', () => {
    it('initiates from map and feed into the same deterministic conversation context', () => {
        const service = createFixtureChatService();

        const mapResult = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri:
                    'at://did:example:alice/app.patchwork.aid.post/post-5',
                initiatedByDid: 'did:example:helper',
                recipientDid: 'did:example:alice',
                initiatedFrom: 'map',
                now: '2026-02-26T16:10:00.000Z',
            }),
        );

        const feedResult = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri:
                    'at://did:example:alice/app.patchwork.aid.post/post-5',
                initiatedByDid: 'did:example:helper',
                recipientDid: 'did:example:alice',
                initiatedFrom: 'feed',
                now: '2026-02-26T16:11:00.000Z',
            }),
        );

        expect(mapResult.statusCode).toBe(200);
        expect(feedResult.statusCode).toBe(200);

        const mapBody = mapResult.body as {
            conversationUri: string;
            created: boolean;
        };
        const feedBody = feedResult.body as {
            conversationUri: string;
            created: boolean;
        };

        expect(mapBody.created).toBe(true);
        expect(feedBody.created).toBe(false);
        expect(mapBody.conversationUri).toBe(feedBody.conversationUri);
    });

    it('returns unauthorized response when initiation permission fails', () => {
        const service = createFixtureChatService();
        const result = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri:
                    'at://did:example:alice/app.patchwork.aid.post/post-6',
                initiatedByDid: 'did:example:helper',
                recipientDid: 'did:example:alice',
                initiatedFrom: 'detail',
                allowInitiation: 'false',
            }),
        );

        expect(result.statusCode).toBe(403);
        expect(result.body).toMatchObject({
            error: {
                code: 'UNAUTHORIZED',
            },
        });
    });

    it('returns deterministic routing decision for fixture scenario', () => {
        const service = createFixtureChatService();
        const result = service.routeScenarioFromParams(
            new URLSearchParams({ scenario: 'volunteer-best-match' }),
        );

        expect(result.statusCode).toBe(200);
        expect(result.body).toMatchObject({
            decision: {
                matchedRule: 'RULE_VOLUNTEER_POOL',
                destinationKind: 'volunteer-pool',
            },
        });
    });

    it('exposes explicit fallback notice when recipient lacks AT-native capability', () => {
        const service = createFixtureChatService();

        const result = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri:
                    'at://did:example:resource-fallback/app.patchwork.aid.post/post-7',
                initiatedByDid: 'did:example:helper',
                recipientDid: 'did:example:resource-fallback',
                initiatedFrom: 'feed',
                now: '2026-02-26T16:20:00.000Z',
            }),
        );

        expect(result.statusCode).toBe(200);
        expect(result.body).toMatchObject({
            transportPath: 'manual-fallback',
            fallbackNotice: {
                code: 'RECIPIENT_CAPABILITY_MISSING',
                safeForUser: true,
            },
        });
    });

    it('supports safety evaluate/block/mute/report flow', () => {
        const service = createFixtureChatService();

        const block = service.blockFromParams(
            new URLSearchParams({
                actorDid: 'did:example:alice',
                targetDid: 'did:example:blocked',
            }),
        );
        expect(block.statusCode).toBe(200);

        const blocked = service.evaluateSafetyFromParams(
            new URLSearchParams({
                senderDid: 'did:example:blocked',
                recipientDid: 'did:example:alice',
                conversationUri:
                    'at://did:example:alice/app.patchwork.conversation.meta/conv-9',
                message: 'Hello',
                sentAt: '2026-02-26T16:30:00.000Z',
            }),
        );
        expect(blocked.statusCode).toBe(200);
        expect(blocked.body).toMatchObject({
            code: 'BLOCKED',
            allowed: false,
        });

        const report = service.reportFromParams(
            new URLSearchParams({
                subjectUri:
                    'at://did:example:alice/app.patchwork.conversation.meta/conv-9',
                reporterDid: 'did:example:alice',
                reason: 'abuse',
                details: 'Escalate for review',
                createdAt: '2026-02-26T16:31:00.000Z',
            }),
        );

        expect(report.statusCode).toBe(200);
        expect(report.body).toMatchObject({
            reportRecord: {
                reason: 'abuse',
            },
        });

        const drained = service.drainModerationSignals();
        expect(drained.statusCode).toBe(200);
        expect(drained.body).toMatchObject({
            total: 1,
        });
    });
});
