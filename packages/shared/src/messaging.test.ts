import { describe, expect, it } from 'vitest';
import {
    ChatFlowError,
    ChatSafetyControls,
    ConversationMetadataStore,
    DeterministicRoutingAssistant,
    buildPhase5RoutingFixtures,
    createPostLinkedChatContext,
} from './messaging.js';

describe('P5.1 post-linked 1:1 chat initiation', () => {
    it('creates deterministic conversation context from map/feed surfaces', () => {
        const fromMap = createPostLinkedChatContext({
            aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
            initiatedByDid: 'did:example:helper',
            recipientDid: 'did:example:alice',
            initiatedFrom: 'map',
            now: '2026-02-26T15:00:00.000Z',
        });

        const fromFeed = createPostLinkedChatContext({
            aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
            initiatedByDid: 'did:example:helper',
            recipientDid: 'did:example:alice',
            initiatedFrom: 'feed',
            now: '2026-02-26T15:01:00.000Z',
        });

        expect(fromMap.conversationUri).toBe(fromFeed.conversationUri);
        expect(fromMap.record.participantDids).toEqual([
            'did:example:alice',
            'did:example:helper',
        ]);
        expect(fromMap.requestContext.initiatedFrom).toBe('map');
    });

    it('blocks unauthorized chat initiation with actionable error code', () => {
        expect(() =>
            createPostLinkedChatContext({
                aidPostUri:
                    'at://did:example:alice/app.patchwork.aid.post/post-2',
                initiatedByDid: 'did:example:helper',
                recipientDid: 'did:example:alice',
                initiatedFrom: 'detail',
                allowedParticipantDids: ['did:example:alice'],
            }),
        ).toThrowError(ChatFlowError);
    });
});

describe('P5.2 deterministic routing assistant', () => {
    it('matches fixture scenarios with deterministic rule outputs', () => {
        const assistant = new DeterministicRoutingAssistant();
        const fixtures = buildPhase5RoutingFixtures();

        for (const fixture of fixtures) {
            const result = assistant.decide(fixture.input);
            expect(result.matchedRule).toBe(fixture.expectedRule);
            expect(result.destinationKind).toBe(
                fixture.expectedDestinationKind,
            );
            expect(result.machineRationale.length).toBeGreaterThan(0);
            expect(result.humanRationale.length).toBeGreaterThan(0);
        }
    });

    it('uses deterministic tie-break ordering when priorities match', () => {
        const assistant = new DeterministicRoutingAssistant();

        const result = assistant.decide({
            aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/post-3',
            requesterDid: 'did:example:requester',
            aidCategory: 'food',
            urgency: 'medium',
            volunteerCandidates: [
                {
                    id: 'v-b',
                    did: 'did:example:v-b',
                    availability: 'within-24h',
                    trustScore: 0.5,
                    matchesCategory: true,
                },
                {
                    id: 'v-a',
                    did: 'did:example:v-a',
                    availability: 'within-24h',
                    trustScore: 0.5,
                    matchesCategory: true,
                },
            ],
            resourceCandidates: [],
            now: '2026-02-26T15:10:00.000Z',
        });

        expect(result.destinationKind).toBe('volunteer-pool');
        expect(result.destinationId).toBe('volunteer:v-a');
    });

    it('applies volunteer preference signals and distance caps deterministically', () => {
        const assistant = new DeterministicRoutingAssistant();

        const result = assistant.decide({
            aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/post-3b',
            requesterDid: 'did:example:requester',
            aidCategory: 'medical',
            urgency: 'critical',
            volunteerCandidates: [
                {
                    id: 'v-a',
                    did: 'did:example:v-a',
                    availability: 'immediate',
                    trustScore: 0.8,
                    matchesCategory: true,
                    preferredCategories: ['medical'],
                    preferredUrgencyLevels: ['critical'],
                    maxDistanceKm: 8,
                    distanceKm: 7,
                    verificationCheckpointScore: 1,
                },
                {
                    id: 'v-b',
                    did: 'did:example:v-b',
                    availability: 'immediate',
                    trustScore: 0.9,
                    matchesCategory: true,
                    preferredCategories: ['food'],
                    preferredUrgencyLevels: ['low'],
                    maxDistanceKm: 5,
                    distanceKm: 7,
                    verificationCheckpointScore: 0.33,
                },
            ],
            resourceCandidates: [],
            now: '2026-02-26T15:12:00.000Z',
        });

        expect(result.destinationKind).toBe('volunteer-pool');
        expect(result.destinationId).toBe('volunteer:v-a');
        expect(
            result.machineRationale.some(reason =>
                reason.includes('preferred-category=true'),
            ),
        ).toBe(true);
    });
});

describe('P5.3 conversation metadata + capability fallback', () => {
    it('persists queryable metadata and emits explicit fallback notice', () => {
        const assistant = new DeterministicRoutingAssistant();
        const store = new ConversationMetadataStore();

        const chat = createPostLinkedChatContext({
            aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/post-4',
            initiatedByDid: 'did:example:helper',
            recipientDid: 'did:example:alice',
            initiatedFrom: 'feed',
            now: '2026-02-26T15:20:00.000Z',
        });

        const routing = assistant.decide({
            aidPostUri: chat.requestContext.aidPostUri,
            requesterDid: 'did:example:helper',
            aidCategory: 'food',
            urgency: 'high',
            postAuthorDid: 'did:example:alice',
            volunteerCandidates: [],
            resourceCandidates: [],
            now: '2026-02-26T15:20:00.000Z',
        });

        const persisted = store.upsertConversation({
            chat,
            routingDecision: routing,
            recipientCapability: {
                recipientDid: 'did:example:alice',
                supportsAtprotoChat: false,
                fallbackChannels: ['manual-review'],
                detectedAt: '2026-02-26T15:20:00.000Z',
            },
            updatedAt: '2026-02-26T15:21:00.000Z',
        });

        expect(persisted.transportPath).toBe('manual-fallback');
        expect(persisted.fallbackNotice?.code).toBe(
            'RECIPIENT_CAPABILITY_MISSING',
        );

        const byAidPost = store.listForAidPost(chat.requestContext.aidPostUri);
        expect(byAidPost).toHaveLength(1);
        expect(store.listFallbackRequired()).toHaveLength(1);
    });
});

describe('P5.4 safety controls + abuse protections', () => {
    it('supports block/mute/report and rate-limit safety behaviors', () => {
        const safety = new ChatSafetyControls({
            maxMessagesPerWindow: 2,
            windowMs: 10_000,
            abuseKeywords: ['scam'],
        });

        safety.blockParticipant('did:example:alice', 'did:example:bad-actor');
        safety.muteConversation(
            'did:example:alice',
            'at://did:example:alice/app.patchwork.conversation.meta/conv-1',
        );

        expect(
            safety.isMuted(
                'did:example:alice',
                'at://did:example:alice/app.patchwork.conversation.meta/conv-1',
            ),
        ).toBe(true);

        const blockedAttempt = safety.evaluateOutboundMessage({
            senderDid: 'did:example:bad-actor',
            recipientDid: 'did:example:alice',
            conversationUri:
                'at://did:example:alice/app.patchwork.conversation.meta/conv-1',
            message: 'hello',
            sentAt: '2026-02-26T15:30:00.000Z',
        });
        expect(blockedAttempt.allowed).toBe(false);
        expect(blockedAttempt.code).toBe('BLOCKED');

        const first = safety.evaluateOutboundMessage({
            senderDid: 'did:example:helper',
            recipientDid: 'did:example:alice',
            conversationUri:
                'at://did:example:alice/app.patchwork.conversation.meta/conv-2',
            message: 'message one',
            sentAt: '2026-02-26T15:40:00.000Z',
        });
        const second = safety.evaluateOutboundMessage({
            senderDid: 'did:example:helper',
            recipientDid: 'did:example:alice',
            conversationUri:
                'at://did:example:alice/app.patchwork.conversation.meta/conv-2',
            message: 'message two',
            sentAt: '2026-02-26T15:40:02.000Z',
        });
        const rateLimited = safety.evaluateOutboundMessage({
            senderDid: 'did:example:helper',
            recipientDid: 'did:example:alice',
            conversationUri:
                'at://did:example:alice/app.patchwork.conversation.meta/conv-2',
            message: 'message three',
            sentAt: '2026-02-26T15:40:03.000Z',
        });

        expect(first.code).toBe('OK');
        expect(second.code).toBe('OK');
        expect(rateLimited.code).toBe('RATE_LIMITED');

        const abuseFlag = safety.evaluateOutboundMessage({
            senderDid: 'did:example:helper-2',
            recipientDid: 'did:example:alice',
            conversationUri:
                'at://did:example:alice/app.patchwork.conversation.meta/conv-3',
            message: 'This sounds like a scam alert',
            sentAt: '2026-02-26T15:41:00.000Z',
        });

        expect(abuseFlag.allowed).toBe(true);
        expect(abuseFlag.code).toBe('ABUSE_FLAGGED');
        expect(abuseFlag.matchedKeywords).toEqual(['scam']);

        const report = safety.reportAbuse({
            subjectUri:
                'at://did:example:alice/app.patchwork.conversation.meta/conv-3',
            reporterDid: 'did:example:alice',
            reason: 'abuse',
            details: 'Repeated abuse terms in DMs',
            createdAt: '2026-02-26T15:41:05.000Z',
        });

        expect(report.reportRecord.reason).toBe('abuse');
        expect(report.moderationSignal.type).toBe(
            'moderation.review.requested',
        );
        expect(safety.drainModerationSignals().length).toBeGreaterThanOrEqual(
            2,
        );
    });

    it('enforces duplicate spam blocking and exposes operational safety metrics', () => {
        const safety = new ChatSafetyControls({
            maxMessagesPerWindow: 10,
            windowMs: 30_000,
            duplicateWindowMs: 120_000,
            maxDuplicateMessages: 1,
            suspiciousSignalThreshold: 2,
            abuseKeywords: ['scam'],
        });

        const first = safety.evaluateOutboundMessage({
            senderDid: 'did:example:spammer',
            recipientDid: 'did:example:target',
            conversationUri:
                'at://did:example:target/app.patchwork.conversation.meta/conv-spam-1',
            message: 'same copy',
            sentAt: '2026-02-27T03:00:00.000Z',
        });

        const second = safety.evaluateOutboundMessage({
            senderDid: 'did:example:spammer',
            recipientDid: 'did:example:target',
            conversationUri:
                'at://did:example:target/app.patchwork.conversation.meta/conv-spam-1',
            message: 'same copy',
            sentAt: '2026-02-27T03:00:10.000Z',
        });

        const third = safety.evaluateOutboundMessage({
            senderDid: 'did:example:spammer',
            recipientDid: 'did:example:target',
            conversationUri:
                'at://did:example:target/app.patchwork.conversation.meta/conv-spam-1',
            message: 'same copy',
            sentAt: '2026-02-27T03:00:20.000Z',
        });

        expect(first.code).toBe('OK');
        expect(second.code).toBe('DUPLICATE_BLOCKED');
        expect(third.code).toBe('DUPLICATE_BLOCKED');

        const metrics = safety.getMetrics();
        expect(metrics).toMatchObject({
            evaluated: 3,
            duplicateBlocked: 2,
            suspiciousSignals: 1,
        });

        const signals = safety.drainModerationSignals();
        expect(
            signals.some(signal =>
                signal.reason.startsWith('suspicious-pattern:'),
            ),
        ).toBe(true);
    });
});
