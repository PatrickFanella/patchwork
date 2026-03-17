/**
 * Group coordination UX view models and state reducer.
 *
 * Provides presentation-layer types for group channels, members,
 * and group detail views.
 *
 * Issue #126 - Wave 5, Lane 1: Group Coordination
 */

import type {
    GroupChannel,
    GroupMember,
    GroupMemberRole,
    GroupMemberStatus,
    GroupModerationEvent,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Channel card view model
// ---------------------------------------------------------------------------

export interface GroupChannelCardViewModel {
    channelId: string;
    name: string;
    description: string;
    visibilityBadge: {
        label: string;
        icon: 'globe' | 'lock';
        tone: 'neutral' | 'warning';
    };
    memberCountLabel: string;
    isArchived: boolean;
    archiveBadge?: {
        label: string;
        tone: 'muted';
    };
    isRequestLinked: boolean;
    requestLinkLabel?: string;
}

export const toGroupChannelCard = (
    channel: GroupChannel,
): GroupChannelCardViewModel => ({
    channelId: channel.channelId,
    name: channel.name,
    description: channel.description,
    visibilityBadge:
        channel.visibility === 'public'
            ? { label: 'Public', icon: 'globe', tone: 'neutral' }
            : { label: 'Private', icon: 'lock', tone: 'warning' },
    memberCountLabel:
        channel.memberCount === 1
            ? '1 member'
            : `${channel.memberCount} members`,
    isArchived: channel.isArchived,
    archiveBadge: channel.isArchived
        ? { label: 'Archived', tone: 'muted' }
        : undefined,
    isRequestLinked: channel.linkedRequestUri !== undefined,
    requestLinkLabel: channel.linkedRequestUri
        ? `Linked to request`
        : undefined,
});

// ---------------------------------------------------------------------------
// Member view model
// ---------------------------------------------------------------------------

export interface GroupMemberViewModel {
    memberDid: string;
    roleBadge: {
        label: string;
        tone: 'primary' | 'success' | 'neutral' | 'muted';
    };
    statusLabel: string;
    isActive: boolean;
    canPromote: boolean;
    canDemote: boolean;
    canRemove: boolean;
    canBan: boolean;
}

const ROLE_BADGE_MAP: Record<
    GroupMemberRole,
    GroupMemberViewModel['roleBadge']
> = {
    owner: { label: 'Owner', tone: 'primary' },
    admin: { label: 'Admin', tone: 'success' },
    member: { label: 'Member', tone: 'neutral' },
    viewer: { label: 'Viewer', tone: 'muted' },
};

const STATUS_LABEL_MAP: Record<GroupMemberStatus, string> = {
    active: 'Active',
    invited: 'Invited',
    removed: 'Removed',
    banned: 'Banned',
};

/**
 * Build a member view model for display purposes.
 * Action flags are based on whether the viewer is an admin/owner.
 */
export const toGroupMemberViewModel = (
    member: GroupMember,
    viewerIsAdmin: boolean,
): GroupMemberViewModel => ({
    memberDid: member.memberDid,
    roleBadge: ROLE_BADGE_MAP[member.role],
    statusLabel: STATUS_LABEL_MAP[member.status],
    isActive: member.status === 'active',
    canPromote:
        viewerIsAdmin &&
        member.status === 'active' &&
        member.role !== 'owner',
    canDemote:
        viewerIsAdmin &&
        member.status === 'active' &&
        member.role !== 'owner' &&
        member.role !== 'viewer',
    canRemove:
        viewerIsAdmin &&
        member.status === 'active' &&
        member.role !== 'owner',
    canBan:
        viewerIsAdmin &&
        member.status !== 'banned' &&
        member.role !== 'owner',
});

// ---------------------------------------------------------------------------
// Channel detail view model
// ---------------------------------------------------------------------------

export interface GroupChannelDetailViewModel {
    channel: GroupChannelCardViewModel;
    members: GroupMemberViewModel[];
    moderationEvents: GroupModerationEvent[];
    canPost: boolean;
    canModerate: boolean;
    canManageMembers: boolean;
}

export const toGroupChannelDetail = (input: {
    channel: GroupChannel;
    members: GroupMember[];
    moderationEvents: GroupModerationEvent[];
    viewerRole: GroupMemberRole | null;
    viewerStatus: GroupMemberStatus | null;
}): GroupChannelDetailViewModel => {
    const viewerIsAdmin =
        (input.viewerRole === 'owner' || input.viewerRole === 'admin') &&
        input.viewerStatus === 'active';

    const canPost =
        !input.channel.isArchived &&
        input.viewerStatus === 'active' &&
        input.viewerRole !== null &&
        input.viewerRole !== 'viewer';

    return {
        channel: toGroupChannelCard(input.channel),
        members: input.members.map(m =>
            toGroupMemberViewModel(m, viewerIsAdmin),
        ),
        moderationEvents: input.moderationEvents.map(e => ({ ...e })),
        canPost,
        canModerate: viewerIsAdmin,
        canManageMembers: viewerIsAdmin,
    };
};

// ---------------------------------------------------------------------------
// Group list view model
// ---------------------------------------------------------------------------

export type GroupListFilter = 'all' | 'public' | 'private' | 'request-linked';

export interface GroupListViewModel {
    channels: GroupChannelCardViewModel[];
    activeFilter: GroupListFilter;
    total: number;
    isEmpty: boolean;
    loading: boolean;
}

const matchesGroupFilter = (
    channel: GroupChannel,
    filter: GroupListFilter,
): boolean => {
    switch (filter) {
        case 'all':
            return true;
        case 'public':
            return channel.visibility === 'public';
        case 'private':
            return channel.visibility === 'private';
        case 'request-linked':
            return channel.linkedRequestUri !== undefined;
    }
};

export const toGroupListViewModel = (
    channels: GroupChannel[],
    filter: GroupListFilter = 'all',
    loading: boolean = false,
): GroupListViewModel => {
    const filtered = channels.filter(ch => matchesGroupFilter(ch, filter));

    return {
        channels: filtered.map(toGroupChannelCard),
        activeFilter: filter,
        total: filtered.length,
        isEmpty: filtered.length === 0,
        loading,
    };
};

// ---------------------------------------------------------------------------
// Group state reducer
// ---------------------------------------------------------------------------

export interface GroupState {
    channels: GroupChannel[];
    selectedChannelId: string | null;
    filter: GroupListFilter;
    loading: boolean;
}

export const defaultGroupState: Readonly<GroupState> = Object.freeze({
    channels: [],
    selectedChannelId: null,
    filter: 'all' as GroupListFilter,
    loading: false,
});

export type GroupEvent =
    | { type: 'load-start' }
    | { type: 'load-complete'; channels: GroupChannel[] }
    | { type: 'select-channel'; channelId: string }
    | { type: 'deselect-channel' }
    | { type: 'set-filter'; filter: GroupListFilter }
    | { type: 'channel-created'; channel: GroupChannel }
    | { type: 'channel-archived'; channelId: string }
    | { type: 'channel-updated'; channel: GroupChannel };

export const reduceGroupState = (
    current: GroupState,
    event: GroupEvent,
): GroupState => {
    switch (event.type) {
        case 'load-start':
            return { ...current, loading: true };

        case 'load-complete':
            return {
                ...current,
                channels: event.channels,
                loading: false,
            };

        case 'select-channel':
            return { ...current, selectedChannelId: event.channelId };

        case 'deselect-channel':
            return { ...current, selectedChannelId: null };

        case 'set-filter':
            return { ...current, filter: event.filter };

        case 'channel-created':
            return {
                ...current,
                channels: [...current.channels, event.channel],
            };

        case 'channel-archived':
            return {
                ...current,
                channels: current.channels.map(ch =>
                    ch.channelId === event.channelId
                        ? { ...ch, isArchived: true }
                        : ch,
                ),
                selectedChannelId:
                    current.selectedChannelId === event.channelId
                        ? null
                        : current.selectedChannelId,
            };

        case 'channel-updated':
            return {
                ...current,
                channels: current.channels.map(ch =>
                    ch.channelId === event.channel.channelId
                        ? event.channel
                        : ch,
                ),
            };
    }
};
