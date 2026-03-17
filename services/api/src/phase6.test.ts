import { describe, expect, it } from 'vitest';
import { createFixtureVolunteerService } from './volunteer-service.js';

describe('api phase 6 volunteer onboarding + preference routing', () => {
    it('creates and updates volunteer profiles through API params', () => {
        const service = createFixtureVolunteerService();

        const created = service.upsertFromParams(
            new URLSearchParams({
                did: 'did:example:volunteer-a',
                displayName: 'Ari',
                capabilities: 'transport,food-delivery',
                availability: 'within-24h',
                contactPreference: 'chat-or-call',
                skills: 'route planning,meal delivery',
                availabilityWindows: 'weekday_evenings,weekend_mornings',
                checkpointIdentity: 'approved',
                checkpointSafety: 'approved',
                checkpointReference: 'pending',
                preferredCategories: 'food,transport',
                preferredUrgencies: 'medium,high,critical',
                maxDistanceKm: '15',
                acceptsLateNight: 'true',
                now: '2026-02-26T18:00:00.000Z',
            }),
        );

        expect(created.statusCode).toBe(200);

        const updated = service.upsertFromParams(
            new URLSearchParams({
                did: 'did:example:volunteer-a',
                displayName: 'Ari N.',
                capabilities: 'transport,food-delivery',
                availability: 'immediate',
                contactPreference: 'chat-only',
                skills: 'route planning,meal delivery',
                availabilityWindows: 'weekday_evenings',
                checkpointIdentity: 'approved',
                checkpointSafety: 'approved',
                checkpointReference: 'approved',
                preferredCategories: 'food',
                preferredUrgencies: 'high,critical',
                maxDistanceKm: '12',
                acceptsLateNight: 'false',
                now: '2026-02-26T18:10:00.000Z',
            }),
        );

        expect(updated.statusCode).toBe(200);

        const listed = service.listFromParams();
        expect(listed.statusCode).toBe(200);
        expect(listed.body).toMatchObject({
            total: 1,
            results: [
                {
                    did: 'did:example:volunteer-a',
                    record: {
                        displayName: 'Ari N.',
                        availability: 'immediate',
                    },
                },
            ],
        });
    });

    it('uses stored volunteer preferences in deterministic routing decisions', () => {
        const service = createFixtureVolunteerService();

        service.upsertFromParams(
            new URLSearchParams({
                did: 'did:example:volunteer-a',
                displayName: 'Ari',
                capabilities: 'transport',
                availability: 'immediate',
                contactPreference: 'chat-only',
                skills: 'route planning',
                availabilityWindows: 'weekday_evenings',
                checkpointIdentity: 'approved',
                checkpointSafety: 'approved',
                checkpointReference: 'approved',
                preferredCategories: 'transport',
                preferredUrgencies: 'high,critical',
                maxDistanceKm: '20',
            }),
        );

        service.upsertFromParams(
            new URLSearchParams({
                did: 'did:example:volunteer-b',
                displayName: 'Bo',
                capabilities: 'first-aid',
                availability: 'immediate',
                contactPreference: 'chat-only',
                skills: 'triage',
                availabilityWindows: 'weekday_evenings',
                checkpointIdentity: 'approved',
                checkpointSafety: 'approved',
                checkpointReference: 'approved',
                preferredCategories: 'medical',
                preferredUrgencies: 'critical',
                maxDistanceKm: '12',
            }),
        );

        const routed = service.routePreferenceAwareFromParams(
            new URLSearchParams({
                aidPostUri:
                    'at://did:example:requester/app.patchwork.aid.post/phase6-route',
                requesterDid: 'did:example:requester',
                category: 'medical',
                urgency: 'critical',
                now: '2026-02-26T18:20:00.000Z',
            }),
        );

        expect(routed.statusCode).toBe(200);
        expect(routed.body).toMatchObject({
            decision: {
                matchedRule: 'RULE_VOLUNTEER_POOL',
                destinationId: 'volunteer:volunteer-b',
            },
        });
    });
});
