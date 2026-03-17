/**
 * Group coordination service for multi-party coordination spaces.
 *
 * Provides channel CRUD, membership management, request-linked rooms,
 * and group moderation operations.
 *
 * Issue #126 - Wave 5, Lane 1: Group Coordination
 */

import {
    readQueryString,
    requireQueryString,
    toErrorHttpResult,
    type GroupChannel,
    type GroupMember,
    type GroupMemberRole,
    type GroupMemberStatus,
    type GroupMembershipAction,
    type GroupModerationAction,
    type GroupModerationEvent,
    type GroupVisibility,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Inlined permission & transition helpers
// (Duplicated from group-coordination.ts because the worktree's
// node_modules symlink resolves to the main repo's @patchwork/shared,
// which doesn't yet export these runtime functions.)
// ---------------------------------------------------------------------------

function canJoinGroup(
    channel: Pick<GroupChannel, 'visibility' | 'isArchived'>,
    memberStatus: GroupMemberStatus | null,
): boolean {
    if (channel.isArchived) return false;
    if (memberStatus === 'banned') return false;
    if (memberStatus === 'active') return false;

    if (channel.visibility === 'public') {
        return memberStatus === null || memberStatus === 'removed' || memberStatus === 'invited';
    }

    return memberStatus === 'invited';
}

function canModerateGroup(
    member: Pick<GroupMember, 'role' | 'status'> | null,
): boolean {
    if (!member || member.status !== 'active') return false;
    return member.role === 'owner' || member.role === 'admin';
}

function canManageMembers(
    member: Pick<GroupMember, 'role' | 'status'> | null,
): boolean {
    if (!member || member.status !== 'active') return false;
    return member.role === 'owner' || member.role === 'admin';
}

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
    promote: { from: ['active'], to: 'active' },
    demote: { from: ['active'], to: 'active' },
};

function isValidMembershipTransition(
    currentStatus: GroupMemberStatus | null,
    action: GroupMembershipAction,
): boolean {
    const rule = MEMBERSHIP_TRANSITIONS[action];
    return rule.from.includes(currentStatus);
}

function getMembershipTransitionResult(
    currentStatus: GroupMemberStatus | null,
    action: GroupMembershipAction,
): GroupMemberStatus | null {
    if (!isValidMembershipTransition(currentStatus, action)) return null;
    return MEMBERSHIP_TRANSITIONS[action].to;
}

const ROLE_HIERARCHY: Readonly<Record<GroupMemberRole, number>> = {
    viewer: 0,
    member: 1,
    admin: 2,
    owner: 3,
};

function isValidPromotion(
    currentRole: GroupMemberRole,
    targetRole: GroupMemberRole,
): boolean {
    return ROLE_HIERARCHY[targetRole] > ROLE_HIERARCHY[currentRole];
}

function isValidDemotion(
    currentRole: GroupMemberRole,
    targetRole: GroupMemberRole,
): boolean {
    if (currentRole === 'owner') return false;
    return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY[currentRole];
}

// ---------------------------------------------------------------------------
// Route result type (follows chat-service pattern)
// ---------------------------------------------------------------------------

export interface GroupRouteResult {
    statusCode: number;
    body: unknown;
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

class GroupServiceError extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'GroupServiceError';
    }
}

const requireString = (params: URLSearchParams, key: string): string => {
    return requireQueryString(
        params,
        key,
        missingKey =>
            new GroupServiceError(
                'INVALID_INPUT',
                `Missing required field: ${missingKey}`,
            ),
    );
};

const readString = readQueryString;

const toGroupErrorResult = (
    error: unknown,
    fallbackMessage: string,
): GroupRouteResult => {
    if (error instanceof GroupServiceError) {
        return toErrorHttpResult(400, error.code, error.message, error.details);
    }

    return toErrorHttpResult(400, 'INVALID_INPUT', fallbackMessage);
};

const parseVisibility = (value: string | undefined): GroupVisibility => {
    if (value === 'public' || value === 'private') {
        return value;
    }
    return 'public';
};

// ---------------------------------------------------------------------------
// GroupService class
// ---------------------------------------------------------------------------

export class GroupService {
    private readonly channels = new Map<string, GroupChannel>();
    private readonly members = new Map<string, GroupMember[]>(); // channelId -> members
    private readonly moderationLog: GroupModerationEvent[] = [];
    private channelCounter = 0;
    private moderationEventCounter = 0;

    // -----------------------------------------------------------------
    // Channel CRUD
    // -----------------------------------------------------------------

    createChannelFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const name = requireString(params, 'name');
            const description = readString(params, 'description') ?? '';
            const createdByDid = requireString(params, 'createdByDid');
            const visibility = parseVisibility(readString(params, 'visibility'));
            const linkedRequestUri = readString(params, 'linkedRequestUri');
            const now = readString(params, 'now') ?? new Date().toISOString();

            this.channelCounter += 1;
            const channelId = `grp-ch-${this.channelCounter}-${Date.now()}`;

            const channel: GroupChannel = {
                channelId,
                name,
                description,
                visibility,
                createdByDid,
                memberCount: 1,
                createdAt: now,
                updatedAt: now,
                isArchived: false,
                linkedRequestUri: linkedRequestUri ?? undefined,
            };

            this.channels.set(channelId, channel);

            // Creator is automatically the owner
            const ownerMember: GroupMember = {
                channelId,
                memberDid: createdByDid,
                role: 'owner',
                status: 'active',
                joinedAt: now,
            };

            this.members.set(channelId, [ownerMember]);

            return {
                statusCode: 200,
                body: { channel: { ...channel } },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to create channel.');
        }
    }

    getChannelFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const channelId = requireString(params, 'channelId');
            const channel = this.channels.get(channelId);

            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Channel not found: ${channelId}`,
                );
            }

            return {
                statusCode: 200,
                body: { channel: { ...channel } },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to get channel.');
        }
    }

    listChannelsFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const visibility = readString(params, 'visibility');
            const includeArchived = readString(params, 'includeArchived') === 'true';

            let channels = [...this.channels.values()];

            if (visibility === 'public' || visibility === 'private') {
                channels = channels.filter(ch => ch.visibility === visibility);
            }

            if (!includeArchived) {
                channels = channels.filter(ch => !ch.isArchived);
            }

            channels.sort((a, b) => a.name.localeCompare(b.name));

            return {
                statusCode: 200,
                body: {
                    total: channels.length,
                    channels: channels.map(ch => ({ ...ch })),
                },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to list channels.');
        }
    }

    updateChannelFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const channelId = requireString(params, 'channelId');
            const actorDid = requireString(params, 'actorDid');
            const channel = this.channels.get(channelId);

            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Channel not found: ${channelId}`,
                );
            }

            const actorMember = this.findMember(channelId, actorDid);
            if (!canManageMembers(actorMember)) {
                return toErrorHttpResult(
                    403,
                    'FORBIDDEN',
                    'Only admins and owners can update channel settings.',
                );
            }

            const newName = readString(params, 'name');
            const newDescription = readString(params, 'description');
            const newVisibility = readString(params, 'visibility');
            const now = readString(params, 'now') ?? new Date().toISOString();

            if (newName) channel.name = newName;
            if (newDescription !== undefined) channel.description = newDescription;
            if (newVisibility === 'public' || newVisibility === 'private') {
                channel.visibility = newVisibility;
            }
            channel.updatedAt = now;

            return {
                statusCode: 200,
                body: { channel: { ...channel } },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to update channel.');
        }
    }

    archiveChannelFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const channelId = requireString(params, 'channelId');
            const actorDid = requireString(params, 'actorDid');
            const channel = this.channels.get(channelId);

            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Channel not found: ${channelId}`,
                );
            }

            const actorMember = this.findMember(channelId, actorDid);
            if (!canModerateGroup(actorMember)) {
                return toErrorHttpResult(
                    403,
                    'FORBIDDEN',
                    'Only admins and owners can archive channels.',
                );
            }

            const now = readString(params, 'now') ?? new Date().toISOString();
            const reason = readString(params, 'reason') ?? 'Channel archived';
            channel.isArchived = true;
            channel.updatedAt = now;

            this.recordModerationEvent({
                channelId,
                actorDid,
                action: 'archive_channel',
                reason,
                occurredAt: now,
            });

            return {
                statusCode: 200,
                body: { channel: { ...channel } },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to archive channel.');
        }
    }

    // -----------------------------------------------------------------
    // Membership management
    // -----------------------------------------------------------------

    addMemberFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const channelId = requireString(params, 'channelId');
            const memberDid = requireString(params, 'memberDid');
            const actorDid = requireString(params, 'actorDid');
            const action = (readString(params, 'action') ?? 'join') as GroupMembershipAction;
            const now = readString(params, 'now') ?? new Date().toISOString();

            const channel = this.channels.get(channelId);
            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Channel not found: ${channelId}`,
                );
            }

            const existingMember = this.findMember(channelId, memberDid);
            const currentStatus = existingMember?.status ?? null;

            // For invite/remove/ban, actor must have member management permissions
            if (action === 'invite' || action === 'remove' || action === 'ban') {
                const actorMember = this.findMember(channelId, actorDid);
                if (!canManageMembers(actorMember)) {
                    return toErrorHttpResult(
                        403,
                        'FORBIDDEN',
                        'Insufficient permissions to manage members.',
                    );
                }
            }

            // For join, validate the user can actually join
            if (action === 'join') {
                if (!canJoinGroup(channel, currentStatus)) {
                    return toErrorHttpResult(
                        403,
                        'FORBIDDEN',
                        'Cannot join this channel.',
                    );
                }
            }

            if (!isValidMembershipTransition(currentStatus, action)) {
                return toErrorHttpResult(
                    400,
                    'INVALID_TRANSITION',
                    `Cannot apply '${action}' to member with status '${currentStatus ?? 'none'}'.`,
                );
            }

            const newStatus = getMembershipTransitionResult(currentStatus, action);
            if (newStatus === null) {
                return toErrorHttpResult(
                    400,
                    'INVALID_TRANSITION',
                    'Membership transition failed.',
                );
            }

            const role: GroupMemberRole = readString(params, 'role') as GroupMemberRole ?? 'member';

            if (existingMember) {
                existingMember.status = newStatus;
                existingMember.joinedAt = action === 'join' ? now : existingMember.joinedAt;
            } else {
                const newMember: GroupMember = {
                    channelId,
                    memberDid,
                    role: action === 'invite' ? (role || 'member') : 'member',
                    status: newStatus,
                    joinedAt: now,
                };
                const members = this.members.get(channelId) ?? [];
                members.push(newMember);
                this.members.set(channelId, members);
            }

            this.recalculateMemberCount(channelId);

            const member = this.findMember(channelId, memberDid)!;

            return {
                statusCode: 200,
                body: { member: { ...member }, action },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to update membership.');
        }
    }

    removeMemberFromParams(params: URLSearchParams): GroupRouteResult {
        const augmentedParams = new URLSearchParams(params);
        augmentedParams.set('action', 'remove');
        return this.addMemberFromParams(augmentedParams);
    }

    updateMemberRoleFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const channelId = requireString(params, 'channelId');
            const memberDid = requireString(params, 'memberDid');
            const actorDid = requireString(params, 'actorDid');
            const targetRole = requireString(params, 'targetRole') as GroupMemberRole;
            const now = readString(params, 'now') ?? new Date().toISOString();

            const channel = this.channels.get(channelId);
            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Channel not found: ${channelId}`,
                );
            }

            const actorMember = this.findMember(channelId, actorDid);
            if (!canManageMembers(actorMember)) {
                return toErrorHttpResult(
                    403,
                    'FORBIDDEN',
                    'Insufficient permissions to manage member roles.',
                );
            }

            const member = this.findMember(channelId, memberDid);
            if (!member || member.status !== 'active') {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Active member not found: ${memberDid}`,
                );
            }

            const isPromotion = isValidPromotion(member.role, targetRole);
            const isDemotion = isValidDemotion(member.role, targetRole);

            if (!isPromotion && !isDemotion) {
                return toErrorHttpResult(
                    400,
                    'INVALID_ROLE_CHANGE',
                    `Cannot change role from '${member.role}' to '${targetRole}'.`,
                );
            }

            member.role = targetRole;
            channel.updatedAt = now;

            return {
                statusCode: 200,
                body: {
                    member: { ...member },
                    change: isPromotion ? 'promoted' : 'demoted',
                },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to update member role.');
        }
    }

    getMembersFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const channelId = requireString(params, 'channelId');
            const channel = this.channels.get(channelId);

            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Channel not found: ${channelId}`,
                );
            }

            const statusFilter = readString(params, 'status');
            let members = this.members.get(channelId) ?? [];

            if (statusFilter) {
                members = members.filter(m => m.status === statusFilter);
            }

            return {
                statusCode: 200,
                body: {
                    total: members.length,
                    members: members.map(m => ({ ...m })),
                },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to list members.');
        }
    }

    getMembershipStatusFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const channelId = requireString(params, 'channelId');
            const memberDid = requireString(params, 'memberDid');

            const channel = this.channels.get(channelId);
            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Channel not found: ${channelId}`,
                );
            }

            const member = this.findMember(channelId, memberDid);
            if (!member) {
                return {
                    statusCode: 200,
                    body: { status: null, isMember: false },
                };
            }

            return {
                statusCode: 200,
                body: {
                    status: member.status,
                    role: member.role,
                    isMember: member.status === 'active',
                    member: { ...member },
                },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to get membership status.');
        }
    }

    // -----------------------------------------------------------------
    // Request-linked temporary rooms
    // -----------------------------------------------------------------

    createRequestRoomFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const requestUri = requireString(params, 'requestUri');
            const createdByDid = requireString(params, 'createdByDid');
            const name = readString(params, 'name') ?? `Request Room`;
            const now = readString(params, 'now') ?? new Date().toISOString();

            // Check if a room already exists for this request
            const existing = [...this.channels.values()].find(
                ch => ch.linkedRequestUri === requestUri && !ch.isArchived,
            );

            if (existing) {
                return {
                    statusCode: 200,
                    body: { channel: { ...existing }, created: false },
                };
            }

            this.channelCounter += 1;
            const channelId = `grp-req-${this.channelCounter}-${Date.now()}`;

            const channel: GroupChannel = {
                channelId,
                name,
                description: `Coordination room for request: ${requestUri}`,
                visibility: 'private',
                createdByDid,
                memberCount: 1,
                createdAt: now,
                updatedAt: now,
                isArchived: false,
                linkedRequestUri: requestUri,
            };

            this.channels.set(channelId, channel);

            const ownerMember: GroupMember = {
                channelId,
                memberDid: createdByDid,
                role: 'owner',
                status: 'active',
                joinedAt: now,
            };

            this.members.set(channelId, [ownerMember]);

            return {
                statusCode: 200,
                body: { channel: { ...channel }, created: true },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to create request room.');
        }
    }

    archiveRequestRoomFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const requestUri = requireString(params, 'requestUri');
            const actorDid = requireString(params, 'actorDid');
            const now = readString(params, 'now') ?? new Date().toISOString();

            const channel = [...this.channels.values()].find(
                ch => ch.linkedRequestUri === requestUri && !ch.isArchived,
            );

            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `No active request room found for: ${requestUri}`,
                );
            }

            const actorMember = this.findMember(channel.channelId, actorDid);
            if (!canModerateGroup(actorMember)) {
                return toErrorHttpResult(
                    403,
                    'FORBIDDEN',
                    'Only admins and owners can archive request rooms.',
                );
            }

            channel.isArchived = true;
            channel.updatedAt = now;

            this.recordModerationEvent({
                channelId: channel.channelId,
                actorDid,
                action: 'archive_channel',
                reason: `Request room archived for: ${requestUri}`,
                occurredAt: now,
            });

            return {
                statusCode: 200,
                body: { channel: { ...channel }, archived: true },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to archive request room.');
        }
    }

    // -----------------------------------------------------------------
    // Group moderation
    // -----------------------------------------------------------------

    warnMemberFromParams(params: URLSearchParams): GroupRouteResult {
        return this.applyModerationFromParams(params, 'warn');
    }

    muteMemberFromParams(params: URLSearchParams): GroupRouteResult {
        return this.applyModerationFromParams(params, 'mute');
    }

    removeMessageFromParams(params: URLSearchParams): GroupRouteResult {
        return this.applyModerationFromParams(params, 'remove_message');
    }

    banMemberFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const channelId = requireString(params, 'channelId');
            const actorDid = requireString(params, 'actorDid');
            const targetDid = requireString(params, 'targetDid');
            const reason = readString(params, 'reason') ?? 'Banned by moderator';
            const now = readString(params, 'now') ?? new Date().toISOString();

            const channel = this.channels.get(channelId);
            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Channel not found: ${channelId}`,
                );
            }

            const actorMember = this.findMember(channelId, actorDid);
            if (!canModerateGroup(actorMember)) {
                return toErrorHttpResult(
                    403,
                    'FORBIDDEN',
                    'Only admins and owners can ban members.',
                );
            }

            const targetMember = this.findMember(channelId, targetDid);
            const currentStatus: GroupMemberStatus | null = targetMember?.status ?? null;

            if (!isValidMembershipTransition(currentStatus, 'ban')) {
                return toErrorHttpResult(
                    400,
                    'INVALID_TRANSITION',
                    `Cannot ban member with status '${currentStatus ?? 'none'}'.`,
                );
            }

            if (targetMember) {
                targetMember.status = 'banned';
            } else {
                const newMember: GroupMember = {
                    channelId,
                    memberDid: targetDid,
                    role: 'member',
                    status: 'banned',
                    joinedAt: now,
                };
                const members = this.members.get(channelId) ?? [];
                members.push(newMember);
                this.members.set(channelId, members);
            }

            this.recalculateMemberCount(channelId);

            this.recordModerationEvent({
                channelId,
                actorDid,
                targetDid,
                action: 'ban_member',
                reason,
                occurredAt: now,
            });

            return {
                statusCode: 200,
                body: {
                    ok: true,
                    action: 'ban_member',
                    targetDid,
                    channelId,
                },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to ban member.');
        }
    }

    getModerationLogFromParams(params: URLSearchParams): GroupRouteResult {
        try {
            const channelId = readString(params, 'channelId');

            let log = [...this.moderationLog];
            if (channelId) {
                log = log.filter(evt => evt.channelId === channelId);
            }

            log.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

            return {
                statusCode: 200,
                body: {
                    total: log.length,
                    events: log.map(evt => ({ ...evt })),
                },
            };
        } catch (error) {
            return toGroupErrorResult(error, 'Failed to get moderation log.');
        }
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    private findMember(
        channelId: string,
        memberDid: string,
    ): GroupMember | null {
        const members = this.members.get(channelId) ?? [];
        return members.find(m => m.memberDid === memberDid) ?? null;
    }

    private recalculateMemberCount(channelId: string): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        const members = this.members.get(channelId) ?? [];
        channel.memberCount = members.filter(m => m.status === 'active').length;
    }

    private recordModerationEvent(input: {
        channelId: string;
        actorDid: string;
        targetDid?: string;
        targetMessageId?: string;
        action: GroupModerationAction;
        reason: string;
        occurredAt: string;
    }): void {
        this.moderationEventCounter += 1;
        const eventId = `grp-mod-${this.moderationEventCounter}`;

        const event: GroupModerationEvent = {
            eventId,
            channelId: input.channelId,
            actorDid: input.actorDid,
            targetDid: input.targetDid,
            targetMessageId: input.targetMessageId,
            action: input.action,
            reason: input.reason,
            occurredAt: input.occurredAt,
        };

        this.moderationLog.push(event);
    }

    private applyModerationFromParams(
        params: URLSearchParams,
        action: GroupModerationAction,
    ): GroupRouteResult {
        try {
            const channelId = requireString(params, 'channelId');
            const actorDid = requireString(params, 'actorDid');
            const targetDid = readString(params, 'targetDid');
            const targetMessageId = readString(params, 'targetMessageId');
            const reason = readString(params, 'reason') ?? `${action} by moderator`;
            const now = readString(params, 'now') ?? new Date().toISOString();

            const channel = this.channels.get(channelId);
            if (!channel) {
                return toErrorHttpResult(
                    404,
                    'NOT_FOUND',
                    `Channel not found: ${channelId}`,
                );
            }

            const actorMember = this.findMember(channelId, actorDid);
            if (!canModerateGroup(actorMember)) {
                return toErrorHttpResult(
                    403,
                    'FORBIDDEN',
                    'Only admins and owners can perform moderation actions.',
                );
            }

            this.recordModerationEvent({
                channelId,
                actorDid,
                targetDid: targetDid ?? undefined,
                targetMessageId: targetMessageId ?? undefined,
                action,
                reason,
                occurredAt: now,
            });

            return {
                statusCode: 200,
                body: {
                    ok: true,
                    action,
                    channelId,
                    targetDid,
                    targetMessageId,
                },
            };
        } catch (error) {
            return toGroupErrorResult(error, `Failed to apply moderation action: ${action}.`);
        }
    }
}

export const createGroupService = (): GroupService => {
    return new GroupService();
};
