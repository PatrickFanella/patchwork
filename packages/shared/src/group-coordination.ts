/**
 * Group coordination contracts for multi-party coordination spaces.
 *
 * Supports public/private group channels with membership controls,
 * request-linked temporary coordination rooms, and moderation
 * workflows for group contexts.
 *
 * Issue #126 - Wave 5, Lane 1: Group Coordination
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type GroupVisibility = 'public' | 'private';

export type GroupMemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export type GroupMemberStatus = 'active' | 'invited' | 'removed' | 'banned';

export type GroupMembershipAction =
    | 'invite'
    | 'join'
    | 'leave'
    | 'remove'
    | 'ban'
    | 'promote'
    | 'demote';

export type GroupModerationAction =
    | 'warn'
    | 'mute'
    | 'remove_message'
    | 'ban_member'
    | 'archive_channel';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface GroupChannel {
    channelId: string;
    name: string;
    description: string;
    visibility: GroupVisibility;
    createdByDid: string;
    memberCount: number;
    createdAt: string;
    updatedAt: string;
    isArchived: boolean;
    linkedRequestUri?: string;
}

export interface GroupMember {
    channelId: string;
    memberDid: string;
    role: GroupMemberRole;
    status: GroupMemberStatus;
    joinedAt: string;
}

export interface GroupModerationEvent {
    eventId: string;
    channelId: string;
    actorDid: string;
    targetDid?: string;
    targetMessageId?: string;
    action: GroupModerationAction;
    reason: string;
    occurredAt: string;
}

// ---------------------------------------------------------------------------
// Permission checking functions
// ---------------------------------------------------------------------------

/**
 * Whether a user can join a group channel.
 * Public channels allow any active, non-banned user.
 * Private channels require an explicit invitation.
 */
export function canJoinGroup(
    channel: Pick<GroupChannel, 'visibility' | 'isArchived'>,
    memberStatus: GroupMemberStatus | null,
): boolean {
    if (channel.isArchived) {
        return false;
    }

    if (memberStatus === 'banned') {
        return false;
    }

    if (memberStatus === 'active') {
        return false; // Already a member
    }

    if (channel.visibility === 'public') {
        return memberStatus === null || memberStatus === 'removed' || memberStatus === 'invited';
    }

    // Private channels require an invitation
    return memberStatus === 'invited';
}

/**
 * Whether a member can post messages in a group channel.
 * Requires active membership with member, admin, or owner role.
 * Viewers cannot post.
 */
export function canPostInGroup(
    channel: Pick<GroupChannel, 'isArchived'>,
    member: Pick<GroupMember, 'role' | 'status'> | null,
): boolean {
    if (channel.isArchived) {
        return false;
    }

    if (!member || member.status !== 'active') {
        return false;
    }

    return member.role !== 'viewer';
}

/**
 * Whether a member can perform moderation actions in a group channel.
 * Requires active membership with admin or owner role.
 */
export function canModerateGroup(
    member: Pick<GroupMember, 'role' | 'status'> | null,
): boolean {
    if (!member || member.status !== 'active') {
        return false;
    }

    return member.role === 'owner' || member.role === 'admin';
}

/**
 * Whether a member can manage other members (invite, remove, ban, promote, demote).
 * Requires active membership with admin or owner role.
 */
export function canManageMembers(
    member: Pick<GroupMember, 'role' | 'status'> | null,
): boolean {
    if (!member || member.status !== 'active') {
        return false;
    }

    return member.role === 'owner' || member.role === 'admin';
}

// ---------------------------------------------------------------------------
// Membership transition state machine
// ---------------------------------------------------------------------------

/**
 * Valid membership status transitions for each action.
 */
const MEMBERSHIP_TRANSITIONS: Readonly<
    Record<
        GroupMembershipAction,
        { from: (GroupMemberStatus | null)[]; to: GroupMemberStatus }
    >
> = {
    invite: { from: [null, 'removed'], to: 'invited' },
    join: { from: [null, 'invited', 'removed'], to: 'active' },
    leave: { from: ['active', 'invited'], to: 'removed' },
    remove: { from: ['active', 'invited'], to: 'removed' },
    ban: { from: ['active', 'invited', 'removed', null], to: 'banned' },
    promote: { from: ['active'], to: 'active' }, // Role change, not status change
    demote: { from: ['active'], to: 'active' },  // Role change, not status change
};

/**
 * Whether a membership transition is valid given the current status and action.
 */
export function isValidMembershipTransition(
    currentStatus: GroupMemberStatus | null,
    action: GroupMembershipAction,
): boolean {
    const rule = MEMBERSHIP_TRANSITIONS[action];
    return rule.from.includes(currentStatus);
}

/**
 * Get the resulting status after a membership action.
 * Returns null if the transition is not valid.
 */
export function getMembershipTransitionResult(
    currentStatus: GroupMemberStatus | null,
    action: GroupMembershipAction,
): GroupMemberStatus | null {
    if (!isValidMembershipTransition(currentStatus, action)) {
        return null;
    }

    return MEMBERSHIP_TRANSITIONS[action].to;
}

// ---------------------------------------------------------------------------
// Role hierarchy for promotions/demotions
// ---------------------------------------------------------------------------

const ROLE_HIERARCHY: Readonly<Record<GroupMemberRole, number>> = {
    viewer: 0,
    member: 1,
    admin: 2,
    owner: 3,
};

/**
 * Whether a promotion from one role to another is valid.
 * Can only promote to a strictly higher role.
 */
export function isValidPromotion(
    currentRole: GroupMemberRole,
    targetRole: GroupMemberRole,
): boolean {
    return ROLE_HIERARCHY[targetRole] > ROLE_HIERARCHY[currentRole];
}

/**
 * Whether a demotion from one role to another is valid.
 * Can only demote to a strictly lower role. Cannot demote owners.
 */
export function isValidDemotion(
    currentRole: GroupMemberRole,
    targetRole: GroupMemberRole,
): boolean {
    if (currentRole === 'owner') {
        return false; // Owners cannot be demoted
    }

    return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY[currentRole];
}

// ---------------------------------------------------------------------------
// Contract stubs for testing
// ---------------------------------------------------------------------------

export const groupCoordinationStubs = {
    channel: {
        channelId: 'grp-channel-001',
        name: 'Neighborhood Helpers',
        description: 'Coordination space for local mutual aid',
        visibility: 'public',
        createdByDid: 'did:example:alice',
        memberCount: 5,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        isArchived: false,
    } satisfies GroupChannel,
    privateChannel: {
        channelId: 'grp-channel-002',
        name: 'Request Team',
        description: 'Private team for request coordination',
        visibility: 'private',
        createdByDid: 'did:example:bob',
        memberCount: 3,
        createdAt: '2026-03-01T11:00:00.000Z',
        updatedAt: '2026-03-01T11:00:00.000Z',
        isArchived: false,
    } satisfies GroupChannel,
    member: {
        channelId: 'grp-channel-001',
        memberDid: 'did:example:alice',
        role: 'owner',
        status: 'active',
        joinedAt: '2026-03-01T10:00:00.000Z',
    } satisfies GroupMember,
    moderationEvent: {
        eventId: 'mod-evt-001',
        channelId: 'grp-channel-001',
        actorDid: 'did:example:alice',
        targetDid: 'did:example:bad-actor',
        action: 'ban_member',
        reason: 'Repeated violations',
        occurredAt: '2026-03-01T12:00:00.000Z',
    } satisfies GroupModerationEvent,
};

