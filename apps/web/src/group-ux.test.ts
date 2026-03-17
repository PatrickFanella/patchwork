import { describe, expect, it } from 'vitest';
import type { GroupChannel, GroupMember, GroupModerationEvent } from '@patchwork/shared';
import {
    defaultGroupState,
    reduceGroupState,
    toGroupChannelCard,
    toGroupChannelDetail,
    toGroupListViewModel,
    toGroupMemberViewModel,
} from './group-ux.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeChannel = (overrides: Partial<GroupChannel> = {}): GroupChannel => ({
    channelId: 'grp-ch-1',
    name: 'Test Group',
    description: 'A test group',
    visibility: 'public',
    createdByDid: 'did:example:alice',
    memberCount: 5,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    isArchived: false,
    ...overrides,
});

const makeMember = (overrides: Partial<GroupMember> = {}): GroupMember => ({
    channelId: 'grp-ch-1',
    memberDid: 'did:example:alice',
    role: 'member',
    status: 'active',
    joinedAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
});

const makeModEvent = (
    overrides: Partial<GroupModerationEvent> = {},
): GroupModerationEvent => ({
    eventId: 'mod-evt-1',
    channelId: 'grp-ch-1',
    actorDid: 'did:example:alice',
    action: 'warn',
    reason: 'Test warning',
    occurredAt: '2026-03-01T12:00:00.000Z',
    ...overrides,
});

// ---------------------------------------------------------------------------
// toGroupChannelCard
// ---------------------------------------------------------------------------

describe('toGroupChannelCard', () => {
    it('maps public channel to card with globe icon', () => {
        const card = toGroupChannelCard(makeChannel());
        expect(card.channelId).toBe('grp-ch-1');
        expect(card.name).toBe('Test Group');
        expect(card.visibilityBadge.label).toBe('Public');
        expect(card.visibilityBadge.icon).toBe('globe');
        expect(card.visibilityBadge.tone).toBe('neutral');
    });

    it('maps private channel to card with lock icon', () => {
        const card = toGroupChannelCard(makeChannel({ visibility: 'private' }));
        expect(card.visibilityBadge.label).toBe('Private');
        expect(card.visibilityBadge.icon).toBe('lock');
        expect(card.visibilityBadge.tone).toBe('warning');
    });

    it('shows singular member count label for 1 member', () => {
        const card = toGroupChannelCard(makeChannel({ memberCount: 1 }));
        expect(card.memberCountLabel).toBe('1 member');
    });

    it('shows plural member count label for multiple members', () => {
        const card = toGroupChannelCard(makeChannel({ memberCount: 42 }));
        expect(card.memberCountLabel).toBe('42 members');
    });

    it('shows archive badge for archived channels', () => {
        const card = toGroupChannelCard(makeChannel({ isArchived: true }));
        expect(card.isArchived).toBe(true);
        expect(card.archiveBadge).toBeDefined();
        expect(card.archiveBadge!.label).toBe('Archived');
    });

    it('hides archive badge for active channels', () => {
        const card = toGroupChannelCard(makeChannel({ isArchived: false }));
        expect(card.archiveBadge).toBeUndefined();
    });

    it('shows request link label for linked channels', () => {
        const card = toGroupChannelCard(
            makeChannel({
                linkedRequestUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
            }),
        );
        expect(card.isRequestLinked).toBe(true);
        expect(card.requestLinkLabel).toBe('Linked to request');
    });

    it('hides request link for non-linked channels', () => {
        const card = toGroupChannelCard(makeChannel());
        expect(card.isRequestLinked).toBe(false);
        expect(card.requestLinkLabel).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// toGroupMemberViewModel
// ---------------------------------------------------------------------------

describe('toGroupMemberViewModel', () => {
    it('maps owner role with primary badge', () => {
        const vm = toGroupMemberViewModel(
            makeMember({ role: 'owner' }),
            false,
        );
        expect(vm.roleBadge.label).toBe('Owner');
        expect(vm.roleBadge.tone).toBe('primary');
    });

    it('maps admin role with success badge', () => {
        const vm = toGroupMemberViewModel(
            makeMember({ role: 'admin' }),
            false,
        );
        expect(vm.roleBadge.label).toBe('Admin');
        expect(vm.roleBadge.tone).toBe('success');
    });

    it('maps member role with neutral badge', () => {
        const vm = toGroupMemberViewModel(makeMember(), false);
        expect(vm.roleBadge.label).toBe('Member');
        expect(vm.roleBadge.tone).toBe('neutral');
    });

    it('maps viewer role with muted badge', () => {
        const vm = toGroupMemberViewModel(
            makeMember({ role: 'viewer' }),
            false,
        );
        expect(vm.roleBadge.label).toBe('Viewer');
        expect(vm.roleBadge.tone).toBe('muted');
    });

    it('shows active status', () => {
        const vm = toGroupMemberViewModel(makeMember(), false);
        expect(vm.isActive).toBe(true);
        expect(vm.statusLabel).toBe('Active');
    });

    it('shows invited status', () => {
        const vm = toGroupMemberViewModel(
            makeMember({ status: 'invited' }),
            false,
        );
        expect(vm.isActive).toBe(false);
        expect(vm.statusLabel).toBe('Invited');
    });

    it('shows banned status', () => {
        const vm = toGroupMemberViewModel(
            makeMember({ status: 'banned' }),
            false,
        );
        expect(vm.statusLabel).toBe('Banned');
    });

    it('enables action flags when viewer is admin', () => {
        const vm = toGroupMemberViewModel(makeMember(), true);
        expect(vm.canPromote).toBe(true);
        expect(vm.canDemote).toBe(true);
        expect(vm.canRemove).toBe(true);
        expect(vm.canBan).toBe(true);
    });

    it('disables action flags when viewer is not admin', () => {
        const vm = toGroupMemberViewModel(makeMember(), false);
        expect(vm.canPromote).toBe(false);
        expect(vm.canDemote).toBe(false);
        expect(vm.canRemove).toBe(false);
        expect(vm.canBan).toBe(false);
    });

    it('disables promote/demote/remove for owners even when viewer is admin', () => {
        const vm = toGroupMemberViewModel(
            makeMember({ role: 'owner' }),
            true,
        );
        expect(vm.canPromote).toBe(false);
        expect(vm.canDemote).toBe(false);
        expect(vm.canRemove).toBe(false);
        expect(vm.canBan).toBe(false); // Owners cannot be banned
    });

    it('disables demote for viewers', () => {
        const vm = toGroupMemberViewModel(
            makeMember({ role: 'viewer' }),
            true,
        );
        expect(vm.canDemote).toBe(false);
        expect(vm.canPromote).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// toGroupChannelDetail
// ---------------------------------------------------------------------------

describe('toGroupChannelDetail', () => {
    it('builds detail view with canPost for active member', () => {
        const detail = toGroupChannelDetail({
            channel: makeChannel(),
            members: [makeMember()],
            moderationEvents: [],
            viewerRole: 'member',
            viewerStatus: 'active',
        });

        expect(detail.channel.name).toBe('Test Group');
        expect(detail.members).toHaveLength(1);
        expect(detail.canPost).toBe(true);
        expect(detail.canModerate).toBe(false);
        expect(detail.canManageMembers).toBe(false);
    });

    it('builds detail view with moderation capabilities for admin', () => {
        const detail = toGroupChannelDetail({
            channel: makeChannel(),
            members: [makeMember({ role: 'admin' })],
            moderationEvents: [makeModEvent()],
            viewerRole: 'admin',
            viewerStatus: 'active',
        });

        expect(detail.canPost).toBe(true);
        expect(detail.canModerate).toBe(true);
        expect(detail.canManageMembers).toBe(true);
        expect(detail.moderationEvents).toHaveLength(1);
    });

    it('disables posting for viewers', () => {
        const detail = toGroupChannelDetail({
            channel: makeChannel(),
            members: [],
            moderationEvents: [],
            viewerRole: 'viewer',
            viewerStatus: 'active',
        });

        expect(detail.canPost).toBe(false);
    });

    it('disables posting in archived channels', () => {
        const detail = toGroupChannelDetail({
            channel: makeChannel({ isArchived: true }),
            members: [],
            moderationEvents: [],
            viewerRole: 'owner',
            viewerStatus: 'active',
        });

        expect(detail.canPost).toBe(false);
    });

    it('disables all capabilities for non-active members', () => {
        const detail = toGroupChannelDetail({
            channel: makeChannel(),
            members: [],
            moderationEvents: [],
            viewerRole: 'admin',
            viewerStatus: 'invited',
        });

        expect(detail.canPost).toBe(false);
        expect(detail.canModerate).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// toGroupListViewModel
// ---------------------------------------------------------------------------

describe('toGroupListViewModel', () => {
    const channels = [
        makeChannel({ channelId: 'ch-1', visibility: 'public' }),
        makeChannel({ channelId: 'ch-2', visibility: 'private' }),
        makeChannel({
            channelId: 'ch-3',
            visibility: 'public',
            linkedRequestUri: 'at://did:example:alice/app.patchwork.aid.post/req-1',
        }),
    ];

    it('shows all channels with default filter', () => {
        const vm = toGroupListViewModel(channels);
        expect(vm.total).toBe(3);
        expect(vm.activeFilter).toBe('all');
        expect(vm.isEmpty).toBe(false);
    });

    it('filters to public channels', () => {
        const vm = toGroupListViewModel(channels, 'public');
        expect(vm.total).toBe(2);
    });

    it('filters to private channels', () => {
        const vm = toGroupListViewModel(channels, 'private');
        expect(vm.total).toBe(1);
    });

    it('filters to request-linked channels', () => {
        const vm = toGroupListViewModel(channels, 'request-linked');
        expect(vm.total).toBe(1);
    });

    it('shows empty state', () => {
        const vm = toGroupListViewModel([]);
        expect(vm.isEmpty).toBe(true);
        expect(vm.total).toBe(0);
    });

    it('shows loading state', () => {
        const vm = toGroupListViewModel([], 'all', true);
        expect(vm.loading).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// reduceGroupState
// ---------------------------------------------------------------------------

describe('reduceGroupState', () => {
    it('sets loading on load-start', () => {
        const next = reduceGroupState(defaultGroupState, {
            type: 'load-start',
        });
        expect(next.loading).toBe(true);
    });

    it('sets channels and clears loading on load-complete', () => {
        const channels = [makeChannel()];
        const next = reduceGroupState(
            { ...defaultGroupState, loading: true },
            { type: 'load-complete', channels },
        );
        expect(next.channels).toHaveLength(1);
        expect(next.loading).toBe(false);
    });

    it('selects a channel', () => {
        const next = reduceGroupState(defaultGroupState, {
            type: 'select-channel',
            channelId: 'ch-1',
        });
        expect(next.selectedChannelId).toBe('ch-1');
    });

    it('deselects a channel', () => {
        const state = { ...defaultGroupState, selectedChannelId: 'ch-1' };
        const next = reduceGroupState(state, { type: 'deselect-channel' });
        expect(next.selectedChannelId).toBeNull();
    });

    it('sets filter', () => {
        const next = reduceGroupState(defaultGroupState, {
            type: 'set-filter',
            filter: 'private',
        });
        expect(next.filter).toBe('private');
    });

    it('adds a newly created channel', () => {
        const channel = makeChannel({ channelId: 'new-ch' });
        const next = reduceGroupState(defaultGroupState, {
            type: 'channel-created',
            channel,
        });
        expect(next.channels).toHaveLength(1);
        expect(next.channels[0]!.channelId).toBe('new-ch');
    });

    it('marks a channel as archived', () => {
        const state = {
            ...defaultGroupState,
            channels: [makeChannel({ channelId: 'ch-1' })],
            selectedChannelId: 'ch-1',
        };
        const next = reduceGroupState(state, {
            type: 'channel-archived',
            channelId: 'ch-1',
        });
        expect(next.channels[0]!.isArchived).toBe(true);
        expect(next.selectedChannelId).toBeNull(); // Deselects archived channel
    });

    it('does not deselect other channels on archive', () => {
        const state = {
            ...defaultGroupState,
            channels: [
                makeChannel({ channelId: 'ch-1' }),
                makeChannel({ channelId: 'ch-2' }),
            ],
            selectedChannelId: 'ch-2',
        };
        const next = reduceGroupState(state, {
            type: 'channel-archived',
            channelId: 'ch-1',
        });
        expect(next.selectedChannelId).toBe('ch-2');
    });

    it('updates a channel', () => {
        const state = {
            ...defaultGroupState,
            channels: [makeChannel({ channelId: 'ch-1', name: 'Old' })],
        };
        const next = reduceGroupState(state, {
            type: 'channel-updated',
            channel: makeChannel({ channelId: 'ch-1', name: 'New' }),
        });
        expect(next.channels[0]!.name).toBe('New');
    });
});
