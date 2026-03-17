import { describe, expect, it, beforeEach } from 'vitest';
import {
    LifecycleService,
    createLifecycleService,
    type LifecycleTransitionSuccessResponse,
    type LifecycleTransitionErrorResponse,
    type LifecycleQuerySuccessResponse,
    type AssignmentSuccessResponse,
    type HandoffSuccessResponse,
} from './lifecycle-service.js';

const testPostUri =
    'at://did:example:alice/app.patchwork.aid.post/post-123';
const coordinatorDid = 'did:example:coordinator1';
const volunteerDid = 'did:example:volunteer1';
const requesterDid = 'did:example:requester1';
const moderatorDid = 'did:example:moderator1';
const adminDid = 'did:example:admin1';

const now = '2026-03-01T10:00:00.000Z';

describe('LifecycleService', () => {
    let service: LifecycleService;

    beforeEach(() => {
        service = createLifecycleService();
        service.registerPost(testPostUri, now);
    });

    describe('registerPost', () => {
        it('registers a new post with open status', () => {
            const record = service.getRecord(testPostUri);
            expect(record).toBeDefined();
            expect(record!.currentStatus).toBe('open');
            expect(record!.timeline).toEqual([]);
        });

        it('is idempotent - second registration is a no-op', () => {
            service.registerPost(testPostUri, '2099-01-01T00:00:00.000Z');
            const record = service.getRecord(testPostUri);
            expect(record!.updatedAt).toBe(now);
        });
    });

    describe('transitionFromBody - happy path', () => {
        it('transitions from open to triaged by coordinator', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                reason: 'Initial triage assessment',
                now: '2026-03-01T10:05:00.000Z',
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleTransitionSuccessResponse;
            expect(body.previousStatus).toBe('open');
            expect(body.currentStatus).toBe('triaged');
            expect(body.transition.from).toBe('open');
            expect(body.transition.to).toBe('triaged');
            expect(body.transition.actorDid).toBe(coordinatorDid);
            expect(body.transition.actorRole).toBe('coordinator');
            expect(body.transition.reason).toBe('Initial triage assessment');
            expect(body.timeline).toHaveLength(1);
        });

        it('runs the full happy path end to end', async () => {
            const steps = [
                {
                    targetStatus: 'triaged',
                    actorDid: coordinatorDid,
                    actorRole: 'coordinator',
                    now: '2026-03-01T10:05:00.000Z',
                },
                {
                    targetStatus: 'assigned',
                    actorDid: coordinatorDid,
                    actorRole: 'coordinator',
                    now: '2026-03-01T10:10:00.000Z',
                },
                {
                    targetStatus: 'in_progress',
                    actorDid: volunteerDid,
                    actorRole: 'volunteer',
                    now: '2026-03-01T10:15:00.000Z',
                },
                {
                    targetStatus: 'resolved',
                    actorDid: volunteerDid,
                    actorRole: 'volunteer',
                    now: '2026-03-01T11:00:00.000Z',
                },
                {
                    targetStatus: 'archived',
                    actorDid: coordinatorDid,
                    actorRole: 'coordinator',
                    now: '2026-03-01T12:00:00.000Z',
                },
            ];

            for (const step of steps) {
                const result = await service.transitionFromBody({
                    postUri: testPostUri,
                    ...step,
                });
                expect(result.statusCode).toBe(200);
            }

            const record = service.getRecord(testPostUri);
            expect(record!.currentStatus).toBe('archived');
            expect(record!.timeline).toHaveLength(5);
            expect(record!.timeline[0].from).toBe('open');
            expect(record!.timeline[4].to).toBe('archived');
        });
    });

    describe('transitionFromBody - validation errors', () => {
        it('rejects missing postUri', async () => {
            const result = await service.transitionFromBody({
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
            });

            expect(result.statusCode).toBe(400);
            const body = result.body as LifecycleTransitionErrorResponse;
            expect(body.error.code).toBe('INVALID_INPUT');
        });

        it('rejects invalid targetStatus', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'nonexistent',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
            });

            expect(result.statusCode).toBe(400);
        });

        it('rejects invalid actorDid', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: 'not-a-did',
                actorRole: 'coordinator',
            });

            expect(result.statusCode).toBe(400);
        });

        it('rejects invalid actorRole', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'superuser',
            });

            expect(result.statusCode).toBe(400);
        });
    });

    describe('transitionFromBody - permission enforcement', () => {
        it('rejects requester trying to triage', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: requesterDid,
                actorRole: 'requester',
                now,
            });

            expect(result.statusCode).toBe(403);
            const body = result.body as LifecycleTransitionErrorResponse;
            expect(body.error.code).toBe('ROLE_NOT_PERMITTED');
        });

        it('rejects volunteer trying to triage', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: volunteerDid,
                actorRole: 'volunteer',
                now,
            });

            expect(result.statusCode).toBe(403);
        });

        it('rejects requester trying to archive', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'archived',
                actorDid: requesterDid,
                actorRole: 'requester',
                now,
            });

            expect(result.statusCode).toBe(403);
        });

        it('allows requester to resolve an open request', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'resolved',
                actorDid: requesterDid,
                actorRole: 'requester',
                reason: 'Resolved offline',
                now,
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleTransitionSuccessResponse;
            expect(body.currentStatus).toBe('resolved');
        });

        it('allows moderator to archive from open', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'archived',
                actorDid: moderatorDid,
                actorRole: 'moderator',
                reason: 'Spam removal',
                now,
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleTransitionSuccessResponse;
            expect(body.currentStatus).toBe('archived');
        });
    });

    describe('transitionFromBody - structural transition errors', () => {
        it('rejects backward transition from triaged to open', async () => {
            // First triage
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });

            // Try to go back
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'open',
                actorDid: adminDid,
                actorRole: 'admin',
                now,
            });

            expect(result.statusCode).toBe(403);
            const body = result.body as LifecycleTransitionErrorResponse;
            expect(body.error.code).toBe('TRANSITION_NOT_ALLOWED');
        });

        it('rejects any transition out of archived', async () => {
            // Move to archived directly
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'archived',
                actorDid: moderatorDid,
                actorRole: 'moderator',
                now,
            });

            for (const target of [
                'open',
                'triaged',
                'assigned',
                'in_progress',
                'resolved',
            ] as const) {
                const result = await service.transitionFromBody({
                    postUri: testPostUri,
                    targetStatus: target,
                    actorDid: adminDid,
                    actorRole: 'admin',
                    now,
                });

                expect(result.statusCode).toBe(403);
            }
        });
    });

    describe('transitionFromBody - self-transitions', () => {
        it('allows self-transition for any role (metadata update)', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'open',
                actorDid: requesterDid,
                actorRole: 'requester',
                reason: 'Updated description',
                now,
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleTransitionSuccessResponse;
            expect(body.previousStatus).toBe('open');
            expect(body.currentStatus).toBe('open');
        });
    });

    describe('transitionFromBody - auto-registration', () => {
        it('auto-registers unknown posts on transition', async () => {
            const newUri =
                'at://did:example:bob/app.patchwork.aid.post/post-new';

            const result = await service.transitionFromBody({
                postUri: newUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleTransitionSuccessResponse;
            expect(body.previousStatus).toBe('open');
            expect(body.currentStatus).toBe('triaged');
        });
    });

    describe('transitionFromBody - timeline recording', () => {
        it('records each transition in the timeline with all metadata', async () => {
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                reason: 'Step 1',
                now: '2026-03-01T10:01:00.000Z',
            });

            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'assigned',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                reason: 'Step 2',
                now: '2026-03-01T10:02:00.000Z',
            });

            const record = service.getRecord(testPostUri)!;
            expect(record.timeline).toHaveLength(2);

            expect(record.timeline[0].from).toBe('open');
            expect(record.timeline[0].to).toBe('triaged');
            expect(record.timeline[0].timestamp).toBe(
                '2026-03-01T10:01:00.000Z',
            );
            expect(record.timeline[0].reason).toBe('Step 1');

            expect(record.timeline[1].from).toBe('triaged');
            expect(record.timeline[1].to).toBe('assigned');
            expect(record.timeline[1].timestamp).toBe(
                '2026-03-01T10:02:00.000Z',
            );
        });

        it('failed transitions do not modify the timeline', async () => {
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: requesterDid,
                actorRole: 'requester',
                now,
            });

            expect(result.statusCode).toBe(403);
            const record = service.getRecord(testPostUri)!;
            expect(record.timeline).toHaveLength(0);
            expect(record.currentStatus).toBe('open');
        });
    });

    describe('transitionFromParams', () => {
        it('processes transition from URL search params', async () => {
            const params = new URLSearchParams({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                reason: 'From params',
                now,
            });

            const result = await service.transitionFromParams(params);
            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleTransitionSuccessResponse;
            expect(body.currentStatus).toBe('triaged');
        });
    });

    describe('queryPostLifecycle', () => {
        it('returns lifecycle state for a registered post', () => {
            const result = service.queryPostLifecycle(testPostUri);
            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleQuerySuccessResponse;
            expect(body.postUri).toBe(testPostUri);
            expect(body.currentStatus).toBe('open');
            expect(body.statusLabel).toBe('Open');
            expect(body.timeline).toEqual([]);
            expect(body.validTransitions).toContain('open');
        });

        it('returns 404 for an unknown post', () => {
            const result = service.queryPostLifecycle(
                'at://did:example:unknown/app.patchwork.aid.post/no-such',
            );
            expect(result.statusCode).toBe(404);
        });

        it('returns role-filtered valid transitions', async () => {
            // Move to triaged
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });

            const requesterResult = service.queryPostLifecycle(
                testPostUri,
                'requester',
            );
            const requesterBody =
                requesterResult.body as LifecycleQuerySuccessResponse;
            // Requester from triaged can only self-transition
            expect(requesterBody.validTransitions).toContain('triaged');
            expect(requesterBody.validTransitions).not.toContain('assigned');

            const coordinatorResult = service.queryPostLifecycle(
                testPostUri,
                'coordinator',
            );
            const coordinatorBody =
                coordinatorResult.body as LifecycleQuerySuccessResponse;
            expect(coordinatorBody.validTransitions).toContain('assigned');
            expect(coordinatorBody.validTransitions).toContain('resolved');
        });

        it('includes full timeline after transitions', async () => {
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now: '2026-03-01T10:01:00.000Z',
            });

            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'assigned',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now: '2026-03-01T10:02:00.000Z',
            });

            const result = service.queryPostLifecycle(testPostUri);
            const body = result.body as LifecycleQuerySuccessResponse;
            expect(body.timeline).toHaveLength(2);
            expect(body.currentStatus).toBe('assigned');
        });
    });

    describe('queryFromParams', () => {
        it('queries from URL search params', () => {
            const params = new URLSearchParams({
                postUri: testPostUri,
                actorRole: 'coordinator',
            });

            const result = service.queryFromParams(params);
            expect(result.statusCode).toBe(200);
        });

        it('returns 400 when postUri is missing', () => {
            const params = new URLSearchParams({});
            const result = service.queryFromParams(params);
            expect(result.statusCode).toBe(400);
        });
    });

    describe('reassignment regression', () => {
        it('allows coordinator to reassign from in_progress back to assigned', async () => {
            // Walk to in_progress
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now: '2026-03-01T10:01:00.000Z',
            });
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'assigned',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now: '2026-03-01T10:02:00.000Z',
            });
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'in_progress',
                actorDid: volunteerDid,
                actorRole: 'volunteer',
                now: '2026-03-01T10:03:00.000Z',
            });

            // Reassign
            const result = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'assigned',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                reason: 'Reassigning to different volunteer',
                now: '2026-03-01T10:04:00.000Z',
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as LifecycleTransitionSuccessResponse;
            expect(body.previousStatus).toBe('in_progress');
            expect(body.currentStatus).toBe('assigned');
            expect(body.timeline).toHaveLength(4);
        });
    });

    describe('assignRequest', () => {
        it('assigns a triaged request to a volunteer', async () => {
            // Move to triaged
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });

            const result = await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now: '2026-03-01T10:10:00.000Z',
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as AssignmentSuccessResponse;
            expect(body.currentStatus).toBe('assigned');
            expect(body.assignment.assigneeDid).toBe(volunteerDid);
            expect(body.assignment.status).toBe('pending');
        });

        it('rejects assignment from an invalid state', async () => {
            // Post is still 'open'
            const result = await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now,
            });

            expect(result.statusCode).toBe(403);
        });

        it('rejects assignment for an unknown post', async () => {
            const result = await service.assignRequest({
                postUri: 'at://did:example:unknown/app.patchwork.aid.post/nope',
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now,
            });

            expect(result.statusCode).toBe(404);
        });

        it('validates input schema', async () => {
            const result = await service.assignRequest({
                postUri: 'invalid',
                assigneeDid: 'bad',
                assignerDid: 'bad',
            });

            expect(result.statusCode).toBe(400);
        });
    });

    describe('acceptAssignment', () => {
        it('accepts an assignment and transitions to in_progress', async () => {
            // Triage then assign
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now: '2026-03-01T10:10:00.000Z',
            });

            const result = await service.acceptAssignment({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                now: '2026-03-01T10:15:00.000Z',
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as AssignmentSuccessResponse;
            expect(body.currentStatus).toBe('in_progress');
            expect(body.assignment.status).toBe('accepted');
            expect(body.assignment.respondedAt).toBe('2026-03-01T10:15:00.000Z');
        });

        it('rejects acceptance from wrong volunteer', async () => {
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now,
            });

            const result = await service.acceptAssignment({
                postUri: testPostUri,
                assigneeDid: 'did:example:wrongperson',
                now,
            });

            expect(result.statusCode).toBe(403);
            const body = result.body as LifecycleTransitionErrorResponse;
            expect(body.error.code).toBe('ASSIGNMENT_MISMATCH');
        });

        it('rejects double acceptance', async () => {
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now,
            });
            await service.acceptAssignment({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                now: '2026-03-01T10:15:00.000Z',
            });

            const result = await service.acceptAssignment({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                now: '2026-03-01T10:16:00.000Z',
            });

            expect(result.statusCode).toBe(403);
            const body = result.body as LifecycleTransitionErrorResponse;
            expect(body.error.code).toBe('ASSIGNMENT_ALREADY_RESPONDED');
        });
    });

    describe('declineAssignment', () => {
        it('declines an assignment and reverts to triaged', async () => {
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now: '2026-03-01T10:10:00.000Z',
            });

            const result = await service.declineAssignment({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                reason: 'Not available this week',
                now: '2026-03-01T10:20:00.000Z',
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as AssignmentSuccessResponse;
            expect(body.currentStatus).toBe('triaged');
            expect(body.assignment.status).toBe('declined');
            expect(body.assignment.declineReason).toBe('Not available this week');
        });

        it('allows reassignment after decline', async () => {
            const volunteer2Did = 'did:example:volunteer2';

            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now: '2026-03-01T10:10:00.000Z',
            });
            await service.declineAssignment({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                now: '2026-03-01T10:20:00.000Z',
            });

            // Reassign to a different volunteer
            const result = await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteer2Did,
                assignerDid: coordinatorDid,
                now: '2026-03-01T10:25:00.000Z',
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as AssignmentSuccessResponse;
            expect(body.assignment.assigneeDid).toBe(volunteer2Did);
            expect(body.assignment.status).toBe('pending');
        });
    });

    describe('checkAssignmentTimeout', () => {
        it('does not time out within the window', async () => {
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now: '2026-03-01T10:10:00.000Z',
            });

            // Check 5 minutes later (within 30-minute timeout)
            const result = service.checkAssignmentTimeout(
                testPostUri,
                '2026-03-01T10:15:00.000Z',
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as AssignmentSuccessResponse;
            expect(body.assignment.status).toBe('pending');
            expect(body.currentStatus).toBe('assigned');
        });

        it('times out and reverts to triaged after timeout window', async () => {
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now: '2026-03-01T10:10:00.000Z',
            });

            // Check 31 minutes later (beyond 30-minute timeout)
            const result = service.checkAssignmentTimeout(
                testPostUri,
                '2026-03-01T10:41:00.000Z',
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as AssignmentSuccessResponse;
            expect(body.assignment.status).toBe('timed_out');
            expect(body.currentStatus).toBe('triaged');
        });

        it('returns 404 for unknown post', () => {
            const result = service.checkAssignmentTimeout(
                'at://did:example:unknown/app.patchwork.aid.post/nope',
            );
            expect(result.statusCode).toBe(404);
        });
    });

    describe('completeHandoff', () => {
        it('completes handoff with metadata and transitions to resolved', async () => {
            // Full path: triage -> assign -> accept -> handoff
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now: '2026-03-01T10:10:00.000Z',
            });
            await service.acceptAssignment({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                now: '2026-03-01T10:15:00.000Z',
            });

            const result = await service.completeHandoff({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                notes: 'Delivered groceries to front door',
                recipientConfirmed: true,
                deliveryMethod: 'in_person',
                now: '2026-03-01T11:00:00.000Z',
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as HandoffSuccessResponse;
            expect(body.currentStatus).toBe('resolved');
            expect(body.handoff.completedBy).toBe(volunteerDid);
            expect(body.handoff.notes).toBe('Delivered groceries to front door');
            expect(body.handoff.recipientConfirmed).toBe(true);
            expect(body.handoff.deliveryMethod).toBe('in_person');
        });

        it('rejects handoff when not in in_progress state', async () => {
            // Post is still open
            const result = await service.completeHandoff({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                now,
            });

            expect(result.statusCode).toBe(403);
        });

        it('rejects handoff from wrong volunteer', async () => {
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now,
            });
            await service.acceptAssignment({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                now,
            });

            const result = await service.completeHandoff({
                postUri: testPostUri,
                assigneeDid: 'did:example:impostor',
                now,
            });

            expect(result.statusCode).toBe(403);
            const body = result.body as LifecycleTransitionErrorResponse;
            expect(body.error.code).toBe('ASSIGNMENT_MISMATCH');
        });

        it('includes assignment and handoff in lifecycle query', async () => {
            await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now,
            });
            await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now,
            });
            await service.acceptAssignment({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                now,
            });
            await service.completeHandoff({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                deliveryMethod: 'shipped',
                now: '2026-03-01T12:00:00.000Z',
            });

            const query = service.queryPostLifecycle(testPostUri, 'coordinator');
            const body = query.body as LifecycleQuerySuccessResponse;
            expect(body.assignment).toBeDefined();
            expect(body.assignment!.assigneeDid).toBe(volunteerDid);
            expect(body.handoff).toBeDefined();
            expect(body.handoff!.deliveryMethod).toBe('shipped');
        });
    });

    describe('E2E: full assign/accept/handoff flow', () => {
        it('completes the full lifecycle with assignment workflow', async () => {
            // 1. Triage
            const triageResult = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'triaged',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now: '2026-03-01T10:00:00.000Z',
            });
            expect(triageResult.statusCode).toBe(200);

            // 2. Assign
            const assignResult = await service.assignRequest({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                assignerDid: coordinatorDid,
                now: '2026-03-01T10:05:00.000Z',
            });
            expect(assignResult.statusCode).toBe(200);
            expect((assignResult.body as AssignmentSuccessResponse).currentStatus).toBe('assigned');

            // 3. Accept
            const acceptResult = await service.acceptAssignment({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                now: '2026-03-01T10:10:00.000Z',
            });
            expect(acceptResult.statusCode).toBe(200);
            expect((acceptResult.body as AssignmentSuccessResponse).currentStatus).toBe('in_progress');

            // 4. Complete handoff
            const handoffResult = await service.completeHandoff({
                postUri: testPostUri,
                assigneeDid: volunteerDid,
                notes: 'Groceries delivered',
                recipientConfirmed: true,
                deliveryMethod: 'in_person',
                now: '2026-03-01T11:00:00.000Z',
            });
            expect(handoffResult.statusCode).toBe(200);
            expect((handoffResult.body as HandoffSuccessResponse).currentStatus).toBe('resolved');

            // 5. Archive
            const archiveResult = await service.transitionFromBody({
                postUri: testPostUri,
                targetStatus: 'archived',
                actorDid: coordinatorDid,
                actorRole: 'coordinator',
                now: '2026-03-01T12:00:00.000Z',
            });
            expect(archiveResult.statusCode).toBe(200);

            // Verify final state
            const record = service.getRecord(testPostUri)!;
            expect(record.currentStatus).toBe('archived');
            expect(record.handoff).toBeDefined();
            expect(record.handoff!.recipientConfirmed).toBe(true);
            expect(record.timeline.length).toBeGreaterThanOrEqual(5);
        });
    });
});
