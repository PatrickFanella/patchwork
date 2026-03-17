import { describe, expect, it } from 'vitest';
import {
    canTransition,
    createStatusTransition,
    getValidTargets,
    getValidTargetsForRole,
    isValidLifecycleRole,
    isValidRequestStatus,
    LIFECYCLE_ROLES,
    REQUEST_STATUSES,
    STATUS_LABELS,
    STATUS_TONES,
    TRANSITION_GRAPH,
    TRANSITION_PERMISSIONS,
    validateTransition,
    type LifecycleRole,
    type RequestStatus,
} from './lifecycle.js';

describe('lifecycle state machine', () => {
    describe('isValidRequestStatus', () => {
        it.each(REQUEST_STATUSES)('accepts valid status "%s"', (status) => {
            expect(isValidRequestStatus(status)).toBe(true);
        });

        it('rejects invalid statuses', () => {
            expect(isValidRequestStatus('pending')).toBe(false);
            expect(isValidRequestStatus('closed')).toBe(false);
            expect(isValidRequestStatus('')).toBe(false);
            expect(isValidRequestStatus('OPEN')).toBe(false);
        });
    });

    describe('isValidLifecycleRole', () => {
        it.each(LIFECYCLE_ROLES)('accepts valid role "%s"', (role) => {
            expect(isValidLifecycleRole(role)).toBe(true);
        });

        it('rejects invalid roles', () => {
            expect(isValidLifecycleRole('superuser')).toBe(false);
            expect(isValidLifecycleRole('')).toBe(false);
        });
    });

    describe('validateTransition (graph-only, no role checks)', () => {
        describe('forward transitions along the happy path', () => {
            const happyPath: [RequestStatus, RequestStatus][] = [
                ['open', 'triaged'],
                ['triaged', 'assigned'],
                ['assigned', 'in_progress'],
                ['in_progress', 'resolved'],
                ['resolved', 'archived'],
            ];

            it.each(happyPath)(
                'allows %s -> %s',
                (from, to) => {
                    const result = validateTransition(from, to);
                    expect(result.valid).toBe(true);
                    expect(result.code).toBe('OK');
                },
            );
        });

        describe('self-transitions are always allowed', () => {
            it.each(REQUEST_STATUSES)(
                'allows self-transition for "%s"',
                (status) => {
                    const result = validateTransition(status, status);
                    expect(result.valid).toBe(true);
                    expect(result.code).toBe('SELF_TRANSITION');
                },
            );
        });

        describe('shortcut transitions', () => {
            const shortcuts: [RequestStatus, RequestStatus][] = [
                ['open', 'resolved'],
                ['open', 'archived'],
                ['triaged', 'resolved'],
                ['triaged', 'archived'],
                ['assigned', 'resolved'],
                ['assigned', 'archived'],
                ['in_progress', 'assigned'],
                ['in_progress', 'archived'],
            ];

            it.each(shortcuts)(
                'allows shortcut %s -> %s',
                (from, to) => {
                    const result = validateTransition(from, to);
                    expect(result.valid).toBe(true);
                    expect(result.code).toBe('OK');
                },
            );
        });

        describe('backward/invalid transitions are rejected', () => {
            const invalid: [RequestStatus, RequestStatus][] = [
                ['triaged', 'open'],
                ['assigned', 'open'],
                ['in_progress', 'open'],
                ['in_progress', 'triaged'],
                ['resolved', 'open'],
                ['resolved', 'triaged'],
                ['resolved', 'assigned'],
                ['resolved', 'in_progress'],
                ['archived', 'open'],
                ['archived', 'triaged'],
                ['archived', 'assigned'],
                ['archived', 'in_progress'],
                ['archived', 'resolved'],
            ];

            it.each(invalid)(
                'rejects %s -> %s',
                (from, to) => {
                    const result = validateTransition(from, to);
                    expect(result.valid).toBe(false);
                    expect(result.code).toBe('TRANSITION_NOT_ALLOWED');
                },
            );
        });

        it('archived is a terminal state with no outgoing transitions', () => {
            const result = TRANSITION_GRAPH['archived'];
            expect(result).toEqual([]);
        });
    });

    describe('canTransition (role-aware)', () => {
        describe('coordinator can run the full happy path', () => {
            const happyPath: [RequestStatus, RequestStatus][] = [
                ['open', 'triaged'],
                ['triaged', 'assigned'],
                ['assigned', 'in_progress'],
                ['in_progress', 'resolved'],
                ['resolved', 'archived'],
            ];

            it.each(happyPath)(
                'coordinator: %s -> %s',
                (from, to) => {
                    const result = canTransition(from, to, 'coordinator');
                    expect(result.valid).toBe(true);
                },
            );
        });

        describe('requester permissions', () => {
            it('requester can resolve an open request (quick close)', () => {
                const result = canTransition('open', 'resolved', 'requester');
                expect(result.valid).toBe(true);
            });

            it('requester can resolve an in-progress request', () => {
                const result = canTransition(
                    'in_progress',
                    'resolved',
                    'requester',
                );
                expect(result.valid).toBe(true);
            });

            it('requester cannot triage', () => {
                const result = canTransition('open', 'triaged', 'requester');
                expect(result.valid).toBe(false);
                expect(result.code).toBe('ROLE_NOT_PERMITTED');
            });

            it('requester cannot assign', () => {
                const result = canTransition(
                    'triaged',
                    'assigned',
                    'requester',
                );
                expect(result.valid).toBe(false);
                expect(result.code).toBe('ROLE_NOT_PERMITTED');
            });

            it('requester cannot archive', () => {
                const result = canTransition('open', 'archived', 'requester');
                expect(result.valid).toBe(false);
                expect(result.code).toBe('ROLE_NOT_PERMITTED');
            });
        });

        describe('volunteer permissions', () => {
            it('volunteer can start work on assigned request', () => {
                const result = canTransition(
                    'assigned',
                    'in_progress',
                    'volunteer',
                );
                expect(result.valid).toBe(true);
            });

            it('volunteer can resolve an assigned request', () => {
                const result = canTransition(
                    'assigned',
                    'resolved',
                    'volunteer',
                );
                expect(result.valid).toBe(true);
            });

            it('volunteer can resolve in-progress request', () => {
                const result = canTransition(
                    'in_progress',
                    'resolved',
                    'volunteer',
                );
                expect(result.valid).toBe(true);
            });

            it('volunteer cannot triage', () => {
                const result = canTransition('open', 'triaged', 'volunteer');
                expect(result.valid).toBe(false);
            });

            it('volunteer cannot archive', () => {
                const result = canTransition(
                    'resolved',
                    'archived',
                    'volunteer',
                );
                expect(result.valid).toBe(false);
            });
        });

        describe('moderator permissions', () => {
            it('moderator can archive from any non-archived state', () => {
                const nonArchived = REQUEST_STATUSES.filter(
                    (s) => s !== 'archived',
                );
                for (const status of nonArchived) {
                    const result = canTransition(status, 'archived', 'moderator');
                    if (TRANSITION_GRAPH[status].includes('archived')) {
                        expect(result.valid).toBe(true);
                    }
                }
            });

            it('moderator can run the full happy path', () => {
                expect(
                    canTransition('open', 'triaged', 'moderator').valid,
                ).toBe(true);
                expect(
                    canTransition('triaged', 'assigned', 'moderator').valid,
                ).toBe(true);
                expect(
                    canTransition('assigned', 'in_progress', 'moderator').valid,
                ).toBe(true);
                expect(
                    canTransition('in_progress', 'resolved', 'moderator').valid,
                ).toBe(true);
                expect(
                    canTransition('resolved', 'archived', 'moderator').valid,
                ).toBe(true);
            });
        });

        describe('admin has all permissions that moderator has', () => {
            it('admin can do everything moderator can', () => {
                for (const [_key, roles] of Object.entries(
                    TRANSITION_PERMISSIONS,
                )) {
                    if (roles.includes('moderator')) {
                        expect(roles).toContain('admin');
                    }
                }
            });
        });

        describe('self-transitions are role-agnostic', () => {
            it.each(REQUEST_STATUSES)(
                'any role can self-transition "%s"',
                (status) => {
                    for (const role of LIFECYCLE_ROLES) {
                        const result = canTransition(status, status, role);
                        expect(result.valid).toBe(true);
                        expect(result.code).toBe('SELF_TRANSITION');
                    }
                },
            );
        });

        it('rejects structurally invalid transitions regardless of role', () => {
            const result = canTransition('archived', 'open', 'admin');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('TRANSITION_NOT_ALLOWED');
        });
    });

    describe('createStatusTransition', () => {
        it('creates a transition record with all fields', () => {
            const transition = createStatusTransition({
                from: 'open',
                to: 'triaged',
                actorDid: 'did:example:coordinator1',
                actorRole: 'coordinator',
                timestamp: '2026-03-01T10:00:00.000Z',
                reason: 'Initial triage',
            });

            expect(transition.from).toBe('open');
            expect(transition.to).toBe('triaged');
            expect(transition.actorDid).toBe('did:example:coordinator1');
            expect(transition.actorRole).toBe('coordinator');
            expect(transition.timestamp).toBe('2026-03-01T10:00:00.000Z');
            expect(transition.reason).toBe('Initial triage');
        });

        it('auto-generates timestamp when not provided', () => {
            const transition = createStatusTransition({
                from: 'triaged',
                to: 'assigned',
                actorDid: 'did:example:coordinator1',
                actorRole: 'coordinator',
            });

            expect(transition.timestamp).toBeTruthy();
            expect(Date.parse(transition.timestamp)).not.toBeNaN();
        });

        it('omits reason when not provided', () => {
            const transition = createStatusTransition({
                from: 'assigned',
                to: 'in_progress',
                actorDid: 'did:example:volunteer1',
                actorRole: 'volunteer',
            });

            expect(transition.reason).toBeUndefined();
        });
    });

    describe('getValidTargets', () => {
        it('includes self-transition plus graph targets', () => {
            const targets = getValidTargets('open');
            expect(targets).toContain('open');
            expect(targets).toContain('triaged');
            expect(targets).toContain('resolved');
            expect(targets).toContain('archived');
            expect(targets).not.toContain('assigned');
            expect(targets).not.toContain('in_progress');
        });

        it('archived only has self-transition', () => {
            const targets = getValidTargets('archived');
            expect(targets).toEqual(['archived']);
        });

        it('in_progress includes reassignment and forward transitions', () => {
            const targets = getValidTargets('in_progress');
            expect(targets).toContain('in_progress');
            expect(targets).toContain('assigned');
            expect(targets).toContain('resolved');
            expect(targets).toContain('archived');
        });
    });

    describe('getValidTargetsForRole', () => {
        it('requester from open can only self-transition or resolve', () => {
            const targets = getValidTargetsForRole('open', 'requester');
            expect(targets).toContain('open');
            expect(targets).toContain('resolved');
            expect(targets).not.toContain('triaged');
            expect(targets).not.toContain('archived');
        });

        it('volunteer from assigned can start, resolve, or self-transition', () => {
            const targets = getValidTargetsForRole('assigned', 'volunteer');
            expect(targets).toContain('assigned');
            expect(targets).toContain('in_progress');
            expect(targets).toContain('resolved');
            expect(targets).not.toContain('archived');
        });

        it('admin from any state has all graph transitions', () => {
            for (const status of REQUEST_STATUSES) {
                const targets = getValidTargetsForRole(status, 'admin');
                const graphTargets = TRANSITION_GRAPH[status];
                for (const target of graphTargets) {
                    expect(targets).toContain(target);
                }
            }
        });
    });

    describe('STATUS_LABELS and STATUS_TONES', () => {
        it('every status has a label', () => {
            for (const status of REQUEST_STATUSES) {
                expect(STATUS_LABELS[status]).toBeTruthy();
                expect(typeof STATUS_LABELS[status]).toBe('string');
            }
        });

        it('every status has a tone', () => {
            for (const status of REQUEST_STATUSES) {
                expect(STATUS_TONES[status]).toBeTruthy();
                expect(['neutral', 'info', 'success', 'danger']).toContain(
                    STATUS_TONES[status],
                );
            }
        });
    });

    describe('transition graph completeness', () => {
        it('every status has an entry in the transition graph', () => {
            for (const status of REQUEST_STATUSES) {
                expect(TRANSITION_GRAPH[status]).toBeDefined();
                expect(Array.isArray(TRANSITION_GRAPH[status])).toBe(true);
            }
        });

        it('all targets in graph are valid statuses', () => {
            for (const [, targets] of Object.entries(TRANSITION_GRAPH)) {
                for (const target of targets) {
                    expect(isValidRequestStatus(target)).toBe(true);
                }
            }
        });

        it('every non-self transition in the graph has a permission entry', () => {
            for (const [from, targets] of Object.entries(TRANSITION_GRAPH)) {
                for (const to of targets) {
                    const key =
                        `${from}->${to}` as keyof typeof TRANSITION_PERMISSIONS;
                    const perms = TRANSITION_PERMISSIONS[key];
                    expect(perms).toBeDefined();
                    expect(perms!.length).toBeGreaterThan(
                        0,
                    );
                }
            }
        });

        it('no permission entry references a transition not in the graph', () => {
            for (const key of Object.keys(TRANSITION_PERMISSIONS)) {
                const [from, to] = key.split('->') as [
                    RequestStatus,
                    RequestStatus,
                ];
                expect(isValidRequestStatus(from)).toBe(true);
                expect(isValidRequestStatus(to)).toBe(true);
                expect(TRANSITION_GRAPH[from]).toContain(to);
            }
        });
    });

    describe('regression: full end-to-end lifecycle', () => {
        it('walks the full happy path and records timeline', () => {
            const timeline: ReturnType<typeof createStatusTransition>[] = [];
            let currentStatus: RequestStatus = 'open';

            const transitions: {
                to: RequestStatus;
                role: LifecycleRole;
                actor: string;
            }[] = [
                {
                    to: 'triaged',
                    role: 'coordinator',
                    actor: 'did:example:coord',
                },
                {
                    to: 'assigned',
                    role: 'coordinator',
                    actor: 'did:example:coord',
                },
                {
                    to: 'in_progress',
                    role: 'volunteer',
                    actor: 'did:example:vol',
                },
                {
                    to: 'resolved',
                    role: 'volunteer',
                    actor: 'did:example:vol',
                },
                {
                    to: 'archived',
                    role: 'coordinator',
                    actor: 'did:example:coord',
                },
            ];

            for (const { to, role, actor } of transitions) {
                const check = canTransition(currentStatus, to, role);
                expect(check.valid).toBe(true);

                timeline.push(
                    createStatusTransition({
                        from: currentStatus,
                        to,
                        actorDid: actor,
                        actorRole: role,
                        reason: `Transition to ${to}`,
                    }),
                );

                currentStatus = to;
            }

            expect(currentStatus).toBe('archived');
            expect(timeline).toHaveLength(5);
            expect(timeline[0].from).toBe('open');
            expect(timeline[timeline.length - 1].to).toBe('archived');
        });

        it('prevents reverting an archived request', () => {
            const result = canTransition('archived', 'open', 'admin');
            expect(result.valid).toBe(false);
        });

        it('prevents requester from self-promoting to assigned', () => {
            const result = canTransition('triaged', 'assigned', 'requester');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('ROLE_NOT_PERMITTED');
        });

        it('allows reassignment from in_progress back to assigned', () => {
            const result = canTransition(
                'in_progress',
                'assigned',
                'coordinator',
            );
            expect(result.valid).toBe(true);
        });
    });
});
