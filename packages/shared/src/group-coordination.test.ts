import { describe, expect, it } from 'vitest';
import {
    canJoinGroup,
    canManageMembers,
    canModerateGroup,
    canPostInGroup,
    getMembershipTransitionResult,
    groupCoordinationStubs,
    isValidDemotion,
    isValidMembershipTransition,
    isValidPromotion,
    type GroupChannel,
    type GroupMemberRole,
    type GroupMembershipAction,
    type GroupMemberStatus,
    type GroupModerationAction,
    type GroupVisibility,
} from './group-coordination.js';

describe('group-coordination contracts (Issue #126)', () => {
    // -----------------------------------------------------------------
    // Type stubs shape validation
    // -----------------------------------------------------------------

    describe('contract stubs', () => {
        it('channel stub satisfies GroupChannel shape', () => {
            const ch = groupCoordinationStubs.channel;
            expect(ch.channelId).toBe('grp-channel-001');
            expect(ch.visibility).toBe('public');
            expect(ch.isArchived).toBe(false);
            expect(typeof ch.memberCount).toBe('number');
            expect(ch.createdByDid).toMatch(/^did:/);
        });

        it('private channel stub has private visibility', () => {
            expect(groupCoordinationStubs.privateChannel.visibility).toBe('private');
        });

        it('member stub satisfies GroupMember shape', () => {
            const m = groupCoordinationStubs.member;
            expect(m.channelId).toBe('grp-channel-001');
            expect(m.memberDid).toMatch(/^did:/);
            expect(m.role).toBe('owner');
            expect(m.status).toBe('active');
        });

        it('moderation event stub satisfies GroupModerationEvent shape', () => {
            const evt = groupCoordinationStubs.moderationEvent;
            expect(evt.eventId).toBe('mod-evt-001');
            expect(evt.action).toBe('ban_member');
            expect(evt.reason.length).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------
    // Type enumerations
    // -----------------------------------------------------------------

    describe('type enumerations', () => {
        it('GroupVisibility covers public and private', () => {
            const visibilities: GroupVisibility[] = ['public', 'private'];
            expect(visibilities).toHaveLength(2);
        });

        it('GroupMemberRole covers owner, admin, member, viewer', () => {
            const roles: GroupMemberRole[] = ['owner', 'admin', 'member', 'viewer'];
            expect(roles).toHaveLength(4);
        });

        it('GroupMemberStatus covers active, invited, removed, banned', () => {
            const statuses: GroupMemberStatus[] = ['active', 'invited', 'removed', 'banned'];
            expect(statuses).toHaveLength(4);
        });

        it('GroupMembershipAction covers all membership actions', () => {
            const actions: GroupMembershipAction[] = [
                'invite', 'join', 'leave', 'remove', 'ban', 'promote', 'demote',
            ];
            expect(actions).toHaveLength(7);
        });

        it('GroupModerationAction covers all moderation actions', () => {
            const actions: GroupModerationAction[] = [
                'warn', 'mute', 'remove_message', 'ban_member', 'archive_channel',
            ];
            expect(actions).toHaveLength(5);
        });
    });

    // -----------------------------------------------------------------
    // canJoinGroup
    // -----------------------------------------------------------------

    describe('canJoinGroup', () => {
        const publicChannel: Pick<GroupChannel, 'visibility' | 'isArchived'> = {
            visibility: 'public',
            isArchived: false,
        };

        const privateChannel: Pick<GroupChannel, 'visibility' | 'isArchived'> = {
            visibility: 'private',
            isArchived: false,
        };

        const archivedChannel: Pick<GroupChannel, 'visibility' | 'isArchived'> = {
            visibility: 'public',
            isArchived: true,
        };

        it('allows new users to join public channels', () => {
            expect(canJoinGroup(publicChannel, null)).toBe(true);
        });

        it('allows removed users to rejoin public channels', () => {
            expect(canJoinGroup(publicChannel, 'removed')).toBe(true);
        });

        it('prevents banned users from joining', () => {
            expect(canJoinGroup(publicChannel, 'banned')).toBe(false);
        });

        it('prevents already active members from joining again', () => {
            expect(canJoinGroup(publicChannel, 'active')).toBe(false);
        });

        it('prevents joining archived channels', () => {
            expect(canJoinGroup(archivedChannel, null)).toBe(false);
        });

        it('requires invitation for private channels', () => {
            expect(canJoinGroup(privateChannel, null)).toBe(false);
            expect(canJoinGroup(privateChannel, 'invited')).toBe(true);
        });

        it('prevents joining private channels without invite even if removed', () => {
            expect(canJoinGroup(privateChannel, 'removed')).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // canPostInGroup
    // -----------------------------------------------------------------

    describe('canPostInGroup', () => {
        const activeChannel: Pick<GroupChannel, 'isArchived'> = { isArchived: false };
        const archivedChannel: Pick<GroupChannel, 'isArchived'> = { isArchived: true };

        it('allows active members to post', () => {
            expect(canPostInGroup(activeChannel, { role: 'member', status: 'active' })).toBe(true);
        });

        it('allows active admins to post', () => {
            expect(canPostInGroup(activeChannel, { role: 'admin', status: 'active' })).toBe(true);
        });

        it('allows active owners to post', () => {
            expect(canPostInGroup(activeChannel, { role: 'owner', status: 'active' })).toBe(true);
        });

        it('prevents viewers from posting', () => {
            expect(canPostInGroup(activeChannel, { role: 'viewer', status: 'active' })).toBe(false);
        });

        it('prevents non-active members from posting', () => {
            expect(canPostInGroup(activeChannel, { role: 'member', status: 'invited' })).toBe(false);
            expect(canPostInGroup(activeChannel, { role: 'member', status: 'removed' })).toBe(false);
            expect(canPostInGroup(activeChannel, { role: 'member', status: 'banned' })).toBe(false);
        });

        it('prevents posting in archived channels', () => {
            expect(canPostInGroup(archivedChannel, { role: 'owner', status: 'active' })).toBe(false);
        });

        it('prevents non-members from posting', () => {
            expect(canPostInGroup(activeChannel, null)).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // canModerateGroup
    // -----------------------------------------------------------------

    describe('canModerateGroup', () => {
        it('allows owners to moderate', () => {
            expect(canModerateGroup({ role: 'owner', status: 'active' })).toBe(true);
        });

        it('allows admins to moderate', () => {
            expect(canModerateGroup({ role: 'admin', status: 'active' })).toBe(true);
        });

        it('prevents members from moderating', () => {
            expect(canModerateGroup({ role: 'member', status: 'active' })).toBe(false);
        });

        it('prevents viewers from moderating', () => {
            expect(canModerateGroup({ role: 'viewer', status: 'active' })).toBe(false);
        });

        it('prevents non-active admins from moderating', () => {
            expect(canModerateGroup({ role: 'admin', status: 'invited' })).toBe(false);
        });

        it('prevents null members from moderating', () => {
            expect(canModerateGroup(null)).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // canManageMembers
    // -----------------------------------------------------------------

    describe('canManageMembers', () => {
        it('allows owners to manage members', () => {
            expect(canManageMembers({ role: 'owner', status: 'active' })).toBe(true);
        });

        it('allows admins to manage members', () => {
            expect(canManageMembers({ role: 'admin', status: 'active' })).toBe(true);
        });

        it('prevents regular members from managing members', () => {
            expect(canManageMembers({ role: 'member', status: 'active' })).toBe(false);
        });

        it('prevents non-active admins from managing members', () => {
            expect(canManageMembers({ role: 'admin', status: 'removed' })).toBe(false);
        });

        it('prevents null members from managing members', () => {
            expect(canManageMembers(null)).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // isValidMembershipTransition
    // -----------------------------------------------------------------

    describe('isValidMembershipTransition', () => {
        it('allows inviting a non-member', () => {
            expect(isValidMembershipTransition(null, 'invite')).toBe(true);
        });

        it('allows inviting a removed member', () => {
            expect(isValidMembershipTransition('removed', 'invite')).toBe(true);
        });

        it('prevents inviting an active member', () => {
            expect(isValidMembershipTransition('active', 'invite')).toBe(false);
        });

        it('prevents inviting a banned member', () => {
            expect(isValidMembershipTransition('banned', 'invite')).toBe(false);
        });

        it('allows joining from null, invited, or removed', () => {
            expect(isValidMembershipTransition(null, 'join')).toBe(true);
            expect(isValidMembershipTransition('invited', 'join')).toBe(true);
            expect(isValidMembershipTransition('removed', 'join')).toBe(true);
        });

        it('prevents joining when already active', () => {
            expect(isValidMembershipTransition('active', 'join')).toBe(false);
        });

        it('prevents joining when banned', () => {
            expect(isValidMembershipTransition('banned', 'join')).toBe(false);
        });

        it('allows leaving from active or invited', () => {
            expect(isValidMembershipTransition('active', 'leave')).toBe(true);
            expect(isValidMembershipTransition('invited', 'leave')).toBe(true);
        });

        it('prevents leaving from removed or banned', () => {
            expect(isValidMembershipTransition('removed', 'leave')).toBe(false);
            expect(isValidMembershipTransition('banned', 'leave')).toBe(false);
        });

        it('allows removing active or invited members', () => {
            expect(isValidMembershipTransition('active', 'remove')).toBe(true);
            expect(isValidMembershipTransition('invited', 'remove')).toBe(true);
        });

        it('allows banning from any status including null', () => {
            expect(isValidMembershipTransition(null, 'ban')).toBe(true);
            expect(isValidMembershipTransition('active', 'ban')).toBe(true);
            expect(isValidMembershipTransition('invited', 'ban')).toBe(true);
            expect(isValidMembershipTransition('removed', 'ban')).toBe(true);
        });

        it('prevents banning already banned members', () => {
            expect(isValidMembershipTransition('banned', 'ban')).toBe(false);
        });

        it('allows promote/demote only for active members', () => {
            expect(isValidMembershipTransition('active', 'promote')).toBe(true);
            expect(isValidMembershipTransition('active', 'demote')).toBe(true);
            expect(isValidMembershipTransition('invited', 'promote')).toBe(false);
            expect(isValidMembershipTransition(null, 'demote')).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // getMembershipTransitionResult
    // -----------------------------------------------------------------

    describe('getMembershipTransitionResult', () => {
        it('returns invited status for valid invite', () => {
            expect(getMembershipTransitionResult(null, 'invite')).toBe('invited');
        });

        it('returns active status for valid join', () => {
            expect(getMembershipTransitionResult('invited', 'join')).toBe('active');
        });

        it('returns removed status for valid leave', () => {
            expect(getMembershipTransitionResult('active', 'leave')).toBe('removed');
        });

        it('returns banned status for valid ban', () => {
            expect(getMembershipTransitionResult('active', 'ban')).toBe('banned');
        });

        it('returns null for invalid transition', () => {
            expect(getMembershipTransitionResult('banned', 'invite')).toBeNull();
            expect(getMembershipTransitionResult('active', 'join')).toBeNull();
        });
    });

    // -----------------------------------------------------------------
    // Role hierarchy (promotion/demotion)
    // -----------------------------------------------------------------

    describe('isValidPromotion', () => {
        it('promotes viewer to member', () => {
            expect(isValidPromotion('viewer', 'member')).toBe(true);
        });

        it('promotes member to admin', () => {
            expect(isValidPromotion('member', 'admin')).toBe(true);
        });

        it('promotes admin to owner', () => {
            expect(isValidPromotion('admin', 'owner')).toBe(true);
        });

        it('rejects same-level promotion', () => {
            expect(isValidPromotion('member', 'member')).toBe(false);
        });

        it('rejects demotion as promotion', () => {
            expect(isValidPromotion('admin', 'member')).toBe(false);
        });
    });

    describe('isValidDemotion', () => {
        it('demotes admin to member', () => {
            expect(isValidDemotion('admin', 'member')).toBe(true);
        });

        it('demotes member to viewer', () => {
            expect(isValidDemotion('member', 'viewer')).toBe(true);
        });

        it('prevents demoting owners', () => {
            expect(isValidDemotion('owner', 'admin')).toBe(false);
        });

        it('rejects same-level demotion', () => {
            expect(isValidDemotion('member', 'member')).toBe(false);
        });

        it('rejects promotion as demotion', () => {
            expect(isValidDemotion('member', 'admin')).toBe(false);
        });
    });
});
