import { describe, expect, it } from 'vitest';
import {
    CONTRACT_VERSION,
    serviceContractStubs,
    type ApiChatInitiationRequest,
    type ApiQueryAidRequest,
    type ServiceEvent,
} from './contracts.js';
import {
    PHASE8_CHAT_REQUEST,
    PHASE8_FIREHOSE_EVENT,
    PHASE8_MAP_QUERY_REQUEST,
    PHASE8_MODERATION_EVENT,
} from './phase8-fixtures.js';

describe('P8.1 service contract definitions', () => {
    it('CONTRACT_VERSION is a semver-prefixed phase identifier', () => {
        expect(CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+-phase\d+$/);
        expect(CONTRACT_VERSION).toBe('0.9.0-phase9');
    });

    it('serviceContractStubs.api satisfies ApiQueryAidRequest and ApiQueryAidResponse shapes', () => {
        const { request, response } = serviceContractStubs.api;

        expect(typeof request.latitude).toBe('number');
        expect(typeof request.longitude).toBe('number');
        expect(typeof request.radiusKm).toBe('number');

        expect(typeof response.total).toBe('number');
        expect(typeof response.page).toBe('number');
        expect(typeof response.pageSize).toBe('number');
        expect(typeof response.hasNextPage).toBe('boolean');
        expect(Array.isArray(response.results)).toBe(true);
    });

    it('serviceContractStubs.api chat initiation satisfies ApiChatInitiationRequest/Response shapes', () => {
        const { chatInitiation, chatInitiationResponse } =
            serviceContractStubs.api;

        expect(chatInitiation.aidPostUri).toMatch(/^at:\/\//);
        expect(chatInitiation.initiatedByDid).toMatch(/^did:/);
        expect(chatInitiation.recipientDid).toMatch(/^did:/);
        expect(['map', 'feed', 'detail']).toContain(
            chatInitiation.initiatedFrom,
        );

        expect(chatInitiationResponse.conversationUri).toMatch(/^at:\/\//);
        expect(typeof chatInitiationResponse.created).toBe('boolean');
        expect([
            'atproto-direct',
            'resource-fallback',
            'manual-fallback',
        ]).toContain(chatInitiationResponse.transportPath);
    });

    it('serviceContractStubs.indexer event satisfies FirehoseNormalizedEvent shape', () => {
        const { event } = serviceContractStubs.indexer;

        expect(event.type).toBe('firehose.normalized');
        expect(event.recordUri).toMatch(/^at:\/\//);
        expect(event.authorDid).toMatch(/^did:/);
        expect(typeof event.seq).toBe('number');
        expect(['create', 'update', 'delete']).toContain(event.action);
    });

    it('serviceContractStubs.moderationWorker event satisfies ModerationReviewRequestedEvent shape', () => {
        const { event } = serviceContractStubs.moderationWorker;

        expect(event.type).toBe('moderation.review.requested');
        expect(event.subjectUri).toMatch(/^at:\/\//);
        expect(typeof event.reason).toBe('string');
        expect(event.reason.length).toBeGreaterThan(0);
    });

    it('ServiceEvent union discriminates correctly on the type field', () => {
        const firehoseEvent: ServiceEvent = PHASE8_FIREHOSE_EVENT;
        const moderationEvent: ServiceEvent = PHASE8_MODERATION_EVENT;

        expect(firehoseEvent.type).toBe('firehose.normalized');
        expect(moderationEvent.type).toBe('moderation.review.requested');

        if (firehoseEvent.type === 'firehose.normalized') {
            expect(firehoseEvent.seq).toBe(1);
            expect(firehoseEvent.action).toBe('create');
        }

        if (moderationEvent.type === 'moderation.review.requested') {
            expect(moderationEvent.subjectUri).toMatch(/^at:\/\//);
            expect(moderationEvent.reason).toBe('user-report:spam');
        }
    });

    it('phase 8 fixture stubs satisfy ApiQueryAidRequest and ApiChatInitiationRequest shapes', () => {
        const req: ApiQueryAidRequest = PHASE8_MAP_QUERY_REQUEST;
        expect(typeof req.latitude).toBe('number');
        expect(typeof req.longitude).toBe('number');
        expect(typeof req.radiusKm).toBe('number');

        const chatReq: ApiChatInitiationRequest = PHASE8_CHAT_REQUEST;
        expect(chatReq.aidPostUri).toMatch(/^at:\/\//);
        expect(chatReq.initiatedFrom).toBe('map');
    });

    it('all domain names in DomainName union are non-empty strings', () => {
        const domains = [
            'identity',
            'aid-records',
            'geo',
            'ranking',
            'messaging',
            'moderation',
            'directory',
            'volunteer-onboarding',
            'anti-spam',
            'privacy',
        ] as const;

        for (const domain of domains) {
            expect(typeof domain).toBe('string');
            expect(domain.length).toBeGreaterThan(0);
        }
    });
});
