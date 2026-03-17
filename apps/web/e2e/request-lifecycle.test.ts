/**
 * Wave 3 (#99) — E2E contract-path integration test for the aid request
 * lifecycle.
 *
 * Exercises the complete happy-path lifecycle via the LifecycleService and
 * FeedbackService, validating every state transition and the post-handoff
 * feedback loop:
 *
 *   open -> triaged -> assigned -> in_progress -> resolved -> archived
 *          + assignment accept + handoff complete + feedback submission
 *
 * Runs under vitest (not Playwright) so it can import service factories
 * directly and type definitions from @patchwork/shared.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
    createLifecycleService,
    type LifecycleTransitionSuccessResponse,
    type LifecycleTransitionErrorResponse,
    type LifecycleQuerySuccessResponse,
    type AssignmentSuccessResponse,
    type HandoffSuccessResponse,
} from '../../../services/api/src/lifecycle-service.js';
import { createFeedbackService } from '../../../services/api/src/feedback-service.js';
import type { RequestStatus } from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POST_URI = 'at://did:example:requester/app.patchwork.aid.post/e2e-1';
const REQUESTER_DID = 'did:example:requester';
const COORDINATOR_DID = 'did:example:coordinator';
const VOLUNTEER_DID = 'did:example:volunteer';
const T0 = '2026-03-01T10:00:00.000Z';
const T1 = '2026-03-01T10:05:00.000Z';
const T2 = '2026-03-01T10:10:00.000Z';
const T3 = '2026-03-01T10:15:00.000Z';
const T4 = '2026-03-01T11:00:00.000Z';
const T5 = '2026-03-01T12:00:00.000Z';

// ---------------------------------------------------------------------------
// 1. Full happy-path lifecycle
// ---------------------------------------------------------------------------

describe('#99 request lifecycle – happy path', () => {
    it('walks open -> triaged -> assigned -> in_progress -> resolved -> archived', async () => {
        const svc = createLifecycleService();
        svc.registerPost(POST_URI, T0);

        const steps: Array<{
            targetStatus: RequestStatus;
            actorDid: string;
            actorRole: string;
            now: string;
        }> = [
            { targetStatus: 'triaged', actorDid: COORDINATOR_DID, actorRole: 'coordinator', now: T1 },
            { targetStatus: 'assigned', actorDid: COORDINATOR_DID, actorRole: 'coordinator', now: T2 },
            { targetStatus: 'in_progress', actorDid: VOLUNTEER_DID, actorRole: 'volunteer', now: T3 },
            { targetStatus: 'resolved', actorDid: VOLUNTEER_DID, actorRole: 'volunteer', now: T4 },
            { targetStatus: 'archived', actorDid: COORDINATOR_DID, actorRole: 'coordinator', now: T5 },
        ];

        for (const step of steps) {
            const result = await svc.transitionFromBody({ postUri: POST_URI, ...step });
            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleTransitionSuccessResponse;
            expect(body.currentStatus).toBe(step.targetStatus);
        }

        const record = svc.getRecord(POST_URI)!;
        expect(record.currentStatus).toBe('archived');
        expect(record.timeline).toHaveLength(5);
    });

    it('each transition produces correct previous and current status', async () => {
        const svc = createLifecycleService();
        svc.registerPost(POST_URI, T0);

        const pairs: Array<[RequestStatus, RequestStatus]> = [
            ['open', 'triaged'],
            ['triaged', 'assigned'],
            ['assigned', 'in_progress'],
            ['in_progress', 'resolved'],
            ['resolved', 'archived'],
        ];

        const roles: Record<string, string> = {
            triaged: 'coordinator',
            assigned: 'coordinator',
            in_progress: 'volunteer',
            resolved: 'volunteer',
            archived: 'coordinator',
        };

        const dids: Record<string, string> = {
            triaged: COORDINATOR_DID,
            assigned: COORDINATOR_DID,
            in_progress: VOLUNTEER_DID,
            resolved: VOLUNTEER_DID,
            archived: COORDINATOR_DID,
        };

        for (const [expectedPrev, target] of pairs) {
            const result = await svc.transitionFromBody({
                postUri: POST_URI,
                targetStatus: target,
                actorDid: dids[target],
                actorRole: roles[target],
                now: T1,
            });
            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleTransitionSuccessResponse;
            expect(body.previousStatus).toBe(expectedPrev);
            expect(body.currentStatus).toBe(target);
        }
    });
});

// ---------------------------------------------------------------------------
// 2. Assignment + accept + handoff flow
// ---------------------------------------------------------------------------

describe('#99 request lifecycle – assign/accept/handoff flow', () => {
    it('assigns, accepts, and completes handoff with metadata', async () => {
        const svc = createLifecycleService();
        svc.registerPost(POST_URI, T0);

        // Triage
        await svc.transitionFromBody({
            postUri: POST_URI,
            targetStatus: 'triaged',
            actorDid: COORDINATOR_DID,
            actorRole: 'coordinator',
            now: T1,
        });

        // Assign
        const assignResult = await svc.assignRequest({
            postUri: POST_URI,
            assigneeDid: VOLUNTEER_DID,
            assignerDid: COORDINATOR_DID,
            now: T2,
        });
        expect(assignResult.statusCode).toBe(200);
        const assignBody = assignResult.body as AssignmentSuccessResponse;
        expect(assignBody.currentStatus).toBe('assigned');
        expect(assignBody.assignment.status).toBe('pending');

        // Accept
        const acceptResult = await svc.acceptAssignment({
            postUri: POST_URI,
            assigneeDid: VOLUNTEER_DID,
            now: T3,
        });
        expect(acceptResult.statusCode).toBe(200);
        expect((acceptResult.body as AssignmentSuccessResponse).currentStatus).toBe('in_progress');

        // Handoff
        const handoffResult = await svc.completeHandoff({
            postUri: POST_URI,
            assigneeDid: VOLUNTEER_DID,
            notes: 'Delivered to front porch',
            recipientConfirmed: true,
            deliveryMethod: 'in_person',
            now: T4,
        });
        expect(handoffResult.statusCode).toBe(200);
        const handoffBody = handoffResult.body as HandoffSuccessResponse;
        expect(handoffBody.currentStatus).toBe('resolved');
        expect(handoffBody.handoff.completedBy).toBe(VOLUNTEER_DID);
        expect(handoffBody.handoff.recipientConfirmed).toBe(true);
        expect(handoffBody.handoff.deliveryMethod).toBe('in_person');
    });

    it('lifecycle query reflects assignment and handoff metadata', async () => {
        const svc = createLifecycleService();
        svc.registerPost(POST_URI, T0);

        await svc.transitionFromBody({
            postUri: POST_URI, targetStatus: 'triaged',
            actorDid: COORDINATOR_DID, actorRole: 'coordinator', now: T1,
        });
        await svc.assignRequest({
            postUri: POST_URI, assigneeDid: VOLUNTEER_DID,
            assignerDid: COORDINATOR_DID, now: T2,
        });
        await svc.acceptAssignment({
            postUri: POST_URI, assigneeDid: VOLUNTEER_DID, now: T3,
        });
        await svc.completeHandoff({
            postUri: POST_URI, assigneeDid: VOLUNTEER_DID,
            deliveryMethod: 'shipped', now: T4,
        });

        const query = svc.queryPostLifecycle(POST_URI, 'coordinator');
        expect(query.statusCode).toBe(200);
        const body = query.body as LifecycleQuerySuccessResponse;
        expect(body.currentStatus).toBe('resolved');
        expect(body.assignment).toBeDefined();
        expect(body.assignment!.assigneeDid).toBe(VOLUNTEER_DID);
        expect(body.handoff).toBeDefined();
        expect(body.handoff!.deliveryMethod).toBe('shipped');
    });
});

// ---------------------------------------------------------------------------
// 3. Post-handoff feedback loop
// ---------------------------------------------------------------------------

describe('#99 request lifecycle – feedback loop', () => {
    it('submits feedback after handoff and retrieves summary', async () => {
        const svc = createLifecycleService();
        const feedback = createFeedbackService();
        svc.registerPost(POST_URI, T0);

        // Walk through lifecycle to resolved
        await svc.transitionFromBody({
            postUri: POST_URI, targetStatus: 'triaged',
            actorDid: COORDINATOR_DID, actorRole: 'coordinator', now: T1,
        });
        await svc.assignRequest({
            postUri: POST_URI, assigneeDid: VOLUNTEER_DID,
            assignerDid: COORDINATOR_DID, now: T2,
        });
        await svc.acceptAssignment({
            postUri: POST_URI, assigneeDid: VOLUNTEER_DID, now: T3,
        });
        await svc.completeHandoff({
            postUri: POST_URI, assigneeDid: VOLUNTEER_DID,
            recipientConfirmed: true, deliveryMethod: 'in_person', now: T4,
        });

        // Verify resolved
        const record = svc.getRecord(POST_URI)!;
        expect(record.currentStatus).toBe('resolved');

        // Submit feedback
        const fbResult = feedback.submitFeedback({
            requestUri: POST_URI,
            submitterDid: REQUESTER_DID,
            outcome: 'successful',
            rating: 5,
            comment: 'Very helpful, fast response!',
            tags: ['timely', 'kind'],
            createdAt: T5,
        });
        expect(fbResult.statusCode).toBe(201);

        // Verify feedback retrievable
        const forRequest = feedback.getFeedbackForRequest(POST_URI);
        expect(forRequest).toHaveLength(1);
        expect(forRequest[0].rating).toBe(5);
        expect(forRequest[0].outcome).toBe('successful');

        // Verify summary
        const summary = feedback.getSummary();
        expect(summary.totalFeedback).toBe(1);
        expect(summary.avgRating).toBe(5);
        expect(summary.outcomeDistribution.successful).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// 4. Transition guard — invalid paths are rejected
// ---------------------------------------------------------------------------

describe('#99 request lifecycle – transition guards', () => {
    it('rejects skip from open to in_progress', async () => {
        const svc = createLifecycleService();
        svc.registerPost(POST_URI, T0);

        const result = await svc.transitionFromBody({
            postUri: POST_URI,
            targetStatus: 'in_progress',
            actorDid: VOLUNTEER_DID,
            actorRole: 'volunteer',
            now: T1,
        });

        expect(result.statusCode).toBe(403);
        const body = result.body as LifecycleTransitionErrorResponse;
        expect(body.error.code).toBe('TRANSITION_NOT_ALLOWED');
    });

    it('rejects requester trying to triage', async () => {
        const svc = createLifecycleService();
        svc.registerPost(POST_URI, T0);

        const result = await svc.transitionFromBody({
            postUri: POST_URI,
            targetStatus: 'triaged',
            actorDid: REQUESTER_DID,
            actorRole: 'requester',
            now: T1,
        });

        expect(result.statusCode).toBe(403);
        const body = result.body as LifecycleTransitionErrorResponse;
        expect(body.error.code).toBe('ROLE_NOT_PERMITTED');
    });

    it('rejects all transitions out of archived', async () => {
        const svc = createLifecycleService();
        svc.registerPost(POST_URI, T0);

        await svc.transitionFromBody({
            postUri: POST_URI, targetStatus: 'archived',
            actorDid: 'did:example:moderator', actorRole: 'moderator', now: T1,
        });

        for (const target of ['open', 'triaged', 'assigned', 'in_progress', 'resolved'] as const) {
            const result = await svc.transitionFromBody({
                postUri: POST_URI,
                targetStatus: target,
                actorDid: 'did:example:admin',
                actorRole: 'admin',
                now: T2,
            });
            expect(result.statusCode).toBe(403);
        }
    });
});

// ---------------------------------------------------------------------------
// 5. Decline + reassignment path
// ---------------------------------------------------------------------------

describe('#99 request lifecycle – decline and reassignment', () => {
    it('decline reverts to triaged and allows reassignment', async () => {
        const svc = createLifecycleService();
        svc.registerPost(POST_URI, T0);

        await svc.transitionFromBody({
            postUri: POST_URI, targetStatus: 'triaged',
            actorDid: COORDINATOR_DID, actorRole: 'coordinator', now: T1,
        });
        await svc.assignRequest({
            postUri: POST_URI, assigneeDid: VOLUNTEER_DID,
            assignerDid: COORDINATOR_DID, now: T2,
        });

        // Decline
        const declineResult = await svc.declineAssignment({
            postUri: POST_URI,
            assigneeDid: VOLUNTEER_DID,
            reason: 'Schedule conflict',
            now: T3,
        });
        expect(declineResult.statusCode).toBe(200);
        expect((declineResult.body as AssignmentSuccessResponse).currentStatus).toBe('triaged');

        // Reassign to different volunteer
        const volunteer2Did = 'did:example:volunteer2';
        const reassignResult = await svc.assignRequest({
            postUri: POST_URI,
            assigneeDid: volunteer2Did,
            assignerDid: COORDINATOR_DID,
            now: T4,
        });
        expect(reassignResult.statusCode).toBe(200);
        expect(
            (reassignResult.body as AssignmentSuccessResponse).assignment.assigneeDid,
        ).toBe(volunteer2Did);
    });
});
