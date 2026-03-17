/**
 * Canonical request lifecycle state machine for aid posts.
 *
 * Transition graph:
 *   open -> triaged -> assigned -> in_progress -> resolved -> archived
 *
 * Additional allowed transitions:
 *   - open -> resolved (quick close by author)
 *   - open -> archived (spam/duplicate by moderator)
 *   - triaged -> resolved (resolved at triage)
 *   - assigned -> resolved (resolved before starting work)
 *   - assigned -> triaged (decline/timeout fallback for reassignment)
 *   - in_progress -> assigned (reassign to different volunteer)
 *   - resolved -> archived (final archival)
 *
 * Self-transitions (same status) are always allowed for metadata updates.
 */

export const REQUEST_STATUSES = [
    'open',
    'triaged',
    'assigned',
    'in_progress',
    'resolved',
    'archived',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * Roles that participate in lifecycle transitions.
 */
export const LIFECYCLE_ROLES = [
    'requester',
    'volunteer',
    'coordinator',
    'moderator',
    'admin',
] as const;

export type LifecycleRole = (typeof LIFECYCLE_ROLES)[number];

/**
 * Directed graph of valid transitions. Each key maps to the set of statuses
 * it may transition to (excluding self-transitions, which are always allowed).
 */
export const TRANSITION_GRAPH: Readonly<
    Record<RequestStatus, readonly RequestStatus[]>
> = {
    open: ['triaged', 'resolved', 'archived'],
    triaged: ['assigned', 'resolved', 'archived'],
    assigned: ['in_progress', 'resolved', 'archived', 'triaged'],
    in_progress: ['assigned', 'resolved', 'archived'],
    resolved: ['archived'],
    archived: [],
};

/**
 * Which roles are permitted to execute each specific transition.
 * Missing transitions are implicitly disallowed.
 */
export type TransitionKey = `${RequestStatus}->${RequestStatus}`;

export const TRANSITION_PERMISSIONS = {
    // From open
    'open->triaged': ['coordinator', 'moderator', 'admin'],
    'open->resolved': ['requester', 'coordinator', 'moderator', 'admin'],
    'open->archived': ['moderator', 'admin'],

    // From triaged
    'triaged->assigned': ['coordinator', 'moderator', 'admin'],
    'triaged->resolved': ['coordinator', 'moderator', 'admin'],
    'triaged->archived': ['moderator', 'admin'],

    // From assigned
    'assigned->in_progress': ['volunteer', 'coordinator', 'moderator', 'admin'],
    'assigned->resolved': [
        'volunteer',
        'coordinator',
        'moderator',
        'admin',
    ],
    'assigned->archived': ['moderator', 'admin'],
    'assigned->triaged': ['volunteer', 'coordinator', 'moderator', 'admin'],

    // From in_progress
    'in_progress->assigned': ['coordinator', 'moderator', 'admin'],
    'in_progress->resolved': [
        'requester',
        'volunteer',
        'coordinator',
        'moderator',
        'admin',
    ],
    'in_progress->archived': ['moderator', 'admin'],

    // From resolved
    'resolved->archived': ['coordinator', 'moderator', 'admin'],
} satisfies Partial<Record<TransitionKey, readonly LifecycleRole[]>> as Partial<Record<TransitionKey, readonly LifecycleRole[]>>;

/**
 * A single recorded status transition in the audit timeline.
 */
export interface StatusTransition {
    from: RequestStatus;
    to: RequestStatus;
    actorDid: string;
    actorRole: LifecycleRole;
    timestamp: string;
    reason?: string;
}

/**
 * The full audit timeline for a request.
 */
export type RequestTimeline = StatusTransition[];

/**
 * Result type for transition validation.
 */
export interface TransitionValidationResult {
    valid: boolean;
    code:
        | 'OK'
        | 'INVALID_STATUS'
        | 'TRANSITION_NOT_ALLOWED'
        | 'ROLE_NOT_PERMITTED'
        | 'SELF_TRANSITION';
    message: string;
}

/**
 * Check if a value is a valid RequestStatus.
 */
export function isValidRequestStatus(
    value: string,
): value is RequestStatus {
    return REQUEST_STATUSES.includes(value as RequestStatus);
}

/**
 * Check if a value is a valid LifecycleRole.
 */
export function isValidLifecycleRole(
    value: string,
): value is LifecycleRole {
    return LIFECYCLE_ROLES.includes(value as LifecycleRole);
}

/**
 * Build the transition key for permission lookup.
 */
function toTransitionKey(
    from: RequestStatus,
    to: RequestStatus,
): TransitionKey {
    return `${from}->${to}`;
}

/**
 * Validate whether a transition from `current` to `target` is structurally
 * valid in the transition graph (ignoring role permissions).
 */
export function validateTransition(
    current: RequestStatus,
    target: RequestStatus,
): TransitionValidationResult {
    if (!isValidRequestStatus(current) || !isValidRequestStatus(target)) {
        return {
            valid: false,
            code: 'INVALID_STATUS',
            message: `Invalid status value: current=${current}, target=${target}.`,
        };
    }

    if (current === target) {
        return {
            valid: true,
            code: 'SELF_TRANSITION',
            message: `Self-transition on status '${current}' is allowed.`,
        };
    }

    const allowedTargets = TRANSITION_GRAPH[current];
    if (!allowedTargets.includes(target)) {
        return {
            valid: false,
            code: 'TRANSITION_NOT_ALLOWED',
            message: `Transition from '${current}' to '${target}' is not allowed. Valid targets: [${allowedTargets.join(', ')}].`,
        };
    }

    return {
        valid: true,
        code: 'OK',
        message: `Transition from '${current}' to '${target}' is valid.`,
    };
}

/**
 * Check whether a transition from `current` to `target` is valid for
 * the given `role`. This is the main entry point for permission-aware checks.
 */
export function canTransition(
    current: RequestStatus,
    target: RequestStatus,
    role: LifecycleRole,
): TransitionValidationResult {
    const graphResult = validateTransition(current, target);
    if (!graphResult.valid) {
        return graphResult;
    }

    // Self-transitions are always allowed for any role
    if (graphResult.code === 'SELF_TRANSITION') {
        return graphResult;
    }

    const key = toTransitionKey(current, target);
    const permittedRoles = TRANSITION_PERMISSIONS[key];

    if (!permittedRoles || !permittedRoles.includes(role)) {
        return {
            valid: false,
            code: 'ROLE_NOT_PERMITTED',
            message: `Role '${role}' is not permitted to transition from '${current}' to '${target}'. Permitted roles: [${(permittedRoles ?? []).join(', ')}].`,
        };
    }

    return {
        valid: true,
        code: 'OK',
        message: `Transition from '${current}' to '${target}' is permitted for role '${role}'.`,
    };
}

/**
 * Create a new StatusTransition record.
 */
export function createStatusTransition(input: {
    from: RequestStatus;
    to: RequestStatus;
    actorDid: string;
    actorRole: LifecycleRole;
    timestamp?: string;
    reason?: string;
}): StatusTransition {
    return {
        from: input.from,
        to: input.to,
        actorDid: input.actorDid,
        actorRole: input.actorRole,
        timestamp: input.timestamp ?? new Date().toISOString(),
        ...(input.reason ? { reason: input.reason } : {}),
    };
}

/**
 * Get the list of valid target statuses from a given status.
 * Includes self-transition.
 */
export function getValidTargets(
    current: RequestStatus,
): readonly RequestStatus[] {
    return [current, ...TRANSITION_GRAPH[current]];
}

/**
 * Get the list of valid target statuses from a given status for a specific role.
 * Includes self-transition.
 */
export function getValidTargetsForRole(
    current: RequestStatus,
    role: LifecycleRole,
): RequestStatus[] {
    const targets: RequestStatus[] = [current]; // self-transition always allowed

    for (const target of TRANSITION_GRAPH[current]) {
        const key = toTransitionKey(current, target);
        const permittedRoles = TRANSITION_PERMISSIONS[key];
        if (permittedRoles && permittedRoles.includes(role)) {
            targets.push(target);
        }
    }

    return targets;
}

/**
 * Human-readable labels for each status.
 */
export const STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
    open: 'Open',
    triaged: 'Triaged',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    archived: 'Archived',
};

/**
 * Badge tone mapping for UI display.
 */
export const STATUS_TONES: Readonly<
    Record<RequestStatus, 'neutral' | 'info' | 'success' | 'danger'>
> = {
    open: 'danger',
    triaged: 'info',
    assigned: 'info',
    in_progress: 'info',
    resolved: 'success',
    archived: 'neutral',
};

/**
 * Assignment sub-states within the 'assigned' lifecycle status.
 * Tracks whether a volunteer has accepted, declined, or timed out.
 */
export const ASSIGNMENT_STATUSES = [
    'pending',
    'accepted',
    'declined',
    'timed_out',
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Default assignment timeout in milliseconds (30 minutes). */
export const ASSIGNMENT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Tracks the current assignment for a request, including the volunteer,
 * acceptance state, and timeout tracking.
 */
export interface AssignmentRecord {
    assigneeDid: string;
    assignerDid: string;
    assignedAt: string;
    status: AssignmentStatus;
    respondedAt?: string;
    declineReason?: string;
    timeoutMs: number;
}

/**
 * Metadata captured when a handoff (fulfillment) is completed.
 */
export interface HandoffMetadata {
    completedBy: string;
    completedAt: string;
    notes?: string;
    recipientConfirmed?: boolean;
    deliveryMethod?: 'in_person' | 'shipped' | 'digital' | 'other';
}
