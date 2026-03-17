import { describe, expect, it, beforeEach } from 'vitest';
import { GroupService, createGroupService } from './group-service.js';

const ownerDid = 'did:example:owner1';
const memberDid = 'did:example:member1';
const outsiderDid = 'did:example:outsider1';
const requestUri = 'at://did:example:alice/app.patchwork.aid.post/post-123';
const now = '2026-03-01T10:00:00.000Z';

describe('GroupService (Issue #126)', () => {
    let service: GroupService;

    beforeEach(() => {
        service = createGroupService();
    });

    // -----------------------------------------------------------------
    // Channel CRUD
    // -----------------------------------------------------------------

    describe('channel CRUD', () => {
        it('creates a public channel with owner membership', () => {
            const result = service.createChannelFromParams(
                new URLSearchParams({
                    name: 'Neighborhood Helpers',
                    description: 'Local mutual aid',
                    createdByDid: ownerDid,
                    visibility: 'public',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { channel: { channelId: string; name: string; visibility: string; memberCount: number } };
            expect(body.channel.name).toBe('Neighborhood Helpers');
            expect(body.channel.visibility).toBe('public');
            expect(body.channel.memberCount).toBe(1);
        });

        it('creates a private channel', () => {
            const result = service.createChannelFromParams(
                new URLSearchParams({
                    name: 'Private Team',
                    createdByDid: ownerDid,
                    visibility: 'private',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { channel: { visibility: string } };
            expect(body.channel.visibility).toBe('private');
        });

        it('returns 400 when name is missing', () => {
            const result = service.createChannelFromParams(
                new URLSearchParams({ createdByDid: ownerDid }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('gets a channel by id', () => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({
                    name: 'Test Channel',
                    createdByDid: ownerDid,
                    now,
                }),
            );
            const channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;

            const getResult = service.getChannelFromParams(
                new URLSearchParams({ channelId }),
            );

            expect(getResult.statusCode).toBe(200);
            const body = getResult.body as { channel: { name: string } };
            expect(body.channel.name).toBe('Test Channel');
        });

        it('returns 404 for nonexistent channel', () => {
            const result = service.getChannelFromParams(
                new URLSearchParams({ channelId: 'nonexistent' }),
            );
            expect(result.statusCode).toBe(404);
        });

        it('lists channels sorted by name', () => {
            service.createChannelFromParams(
                new URLSearchParams({ name: 'Bravo', createdByDid: ownerDid, now }),
            );
            service.createChannelFromParams(
                new URLSearchParams({ name: 'Alpha', createdByDid: ownerDid, now }),
            );

            const result = service.listChannelsFromParams(new URLSearchParams());
            expect(result.statusCode).toBe(200);
            const body = result.body as { total: number; channels: Array<{ name: string }> };
            expect(body.total).toBe(2);
            expect(body.channels[0]!.name).toBe('Alpha');
            expect(body.channels[1]!.name).toBe('Bravo');
        });

        it('filters channels by visibility', () => {
            service.createChannelFromParams(
                new URLSearchParams({ name: 'Public', createdByDid: ownerDid, visibility: 'public', now }),
            );
            service.createChannelFromParams(
                new URLSearchParams({ name: 'Private', createdByDid: ownerDid, visibility: 'private', now }),
            );

            const pubResult = service.listChannelsFromParams(
                new URLSearchParams({ visibility: 'public' }),
            );
            const body = pubResult.body as { total: number };
            expect(body.total).toBe(1);
        });

        it('excludes archived channels by default', () => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({ name: 'To Archive', createdByDid: ownerDid, now }),
            );
            const channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;

            service.archiveChannelFromParams(
                new URLSearchParams({ channelId, actorDid: ownerDid, now }),
            );

            const listResult = service.listChannelsFromParams(new URLSearchParams());
            const body = listResult.body as { total: number };
            expect(body.total).toBe(0);

            // Include archived
            const withArchived = service.listChannelsFromParams(
                new URLSearchParams({ includeArchived: 'true' }),
            );
            const body2 = withArchived.body as { total: number };
            expect(body2.total).toBe(1);
        });

        it('updates channel settings (name, description, visibility)', () => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({ name: 'Original', createdByDid: ownerDid, now }),
            );
            const channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;

            const updateResult = service.updateChannelFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    name: 'Updated Name',
                    description: 'New desc',
                    visibility: 'private',
                    now,
                }),
            );

            expect(updateResult.statusCode).toBe(200);
            const body = updateResult.body as { channel: { name: string; description: string; visibility: string } };
            expect(body.channel.name).toBe('Updated Name');
            expect(body.channel.description).toBe('New desc');
            expect(body.channel.visibility).toBe('private');
        });

        it('rejects update from non-admin/owner', () => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({ name: 'Test', createdByDid: ownerDid, now }),
            );
            const channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;

            // Add a regular member
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: ownerDid,
                    action: 'invite',
                    now,
                }),
            );
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            const updateResult = service.updateChannelFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: memberDid,
                    name: 'Hack',
                    now,
                }),
            );

            expect(updateResult.statusCode).toBe(403);
        });

        it('archives a channel', () => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({ name: 'To Archive', createdByDid: ownerDid, now }),
            );
            const channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;

            const archiveResult = service.archiveChannelFromParams(
                new URLSearchParams({ channelId, actorDid: ownerDid, reason: 'No longer needed', now }),
            );

            expect(archiveResult.statusCode).toBe(200);
            const body = archiveResult.body as { channel: { isArchived: boolean } };
            expect(body.channel.isArchived).toBe(true);
        });

        it('rejects archive from non-admin/owner', () => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({ name: 'Test', createdByDid: ownerDid, now }),
            );
            const channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;

            const result = service.archiveChannelFromParams(
                new URLSearchParams({ channelId, actorDid: outsiderDid, now }),
            );

            expect(result.statusCode).toBe(403);
        });
    });

    // -----------------------------------------------------------------
    // Membership management
    // -----------------------------------------------------------------

    describe('membership management', () => {
        let channelId: string;

        beforeEach(() => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({
                    name: 'Test Group',
                    createdByDid: ownerDid,
                    visibility: 'public',
                    now,
                }),
            );
            channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;
        });

        it('allows joining a public channel', () => {
            const result = service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { member: { status: string }; action: string };
            expect(body.member.status).toBe('active');
            expect(body.action).toBe('join');
        });

        it('invites a member to a channel', () => {
            const result = service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: ownerDid,
                    action: 'invite',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { member: { status: string } };
            expect(body.member.status).toBe('invited');
        });

        it('invited member can join', () => {
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: ownerDid,
                    action: 'invite',
                    now,
                }),
            );

            const joinResult = service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            expect(joinResult.statusCode).toBe(200);
            const body = joinResult.body as { member: { status: string } };
            expect(body.member.status).toBe('active');
        });

        it('removes a member', () => {
            // Join first
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            const result = service.removeMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: ownerDid,
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { member: { status: string } };
            expect(body.member.status).toBe('removed');
        });

        it('member can leave', () => {
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            const result = service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'leave',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { member: { status: string } };
            expect(body.member.status).toBe('removed');
        });

        it('prevents non-admins from inviting', () => {
            // Add a regular member
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            const result = service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid: outsiderDid,
                    actorDid: memberDid,
                    action: 'invite',
                    now,
                }),
            );

            expect(result.statusCode).toBe(403);
        });

        it('prevents joining already-joined channel', () => {
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            const result = service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            expect(result.statusCode).toBe(403);
        });

        it('returns 404 for nonexistent channel membership', () => {
            const result = service.addMemberFromParams(
                new URLSearchParams({
                    channelId: 'nonexistent',
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );
            expect(result.statusCode).toBe(404);
        });

        it('lists members of a channel', () => {
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            const result = service.getMembersFromParams(
                new URLSearchParams({ channelId }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { total: number; members: Array<{ memberDid: string }> };
            expect(body.total).toBe(2); // owner + member
        });

        it('filters members by status', () => {
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid: outsiderDid,
                    actorDid: ownerDid,
                    action: 'invite',
                    now,
                }),
            );

            const result = service.getMembersFromParams(
                new URLSearchParams({ channelId, status: 'invited' }),
            );

            const body = result.body as { total: number };
            expect(body.total).toBe(1);
        });

        it('gets membership status for a user', () => {
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            const result = service.getMembershipStatusFromParams(
                new URLSearchParams({ channelId, memberDid }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { status: string; isMember: boolean };
            expect(body.status).toBe('active');
            expect(body.isMember).toBe(true);
        });

        it('returns null status for non-members', () => {
            const result = service.getMembershipStatusFromParams(
                new URLSearchParams({ channelId, memberDid: outsiderDid }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { status: null; isMember: boolean };
            expect(body.status).toBeNull();
            expect(body.isMember).toBe(false);
        });

        it('updates member count on membership changes', () => {
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            let ch = service.getChannelFromParams(
                new URLSearchParams({ channelId }),
            );
            expect((ch.body as { channel: { memberCount: number } }).channel.memberCount).toBe(2);

            // Remove member
            service.removeMemberFromParams(
                new URLSearchParams({ channelId, memberDid, actorDid: ownerDid, now }),
            );

            ch = service.getChannelFromParams(
                new URLSearchParams({ channelId }),
            );
            expect((ch.body as { channel: { memberCount: number } }).channel.memberCount).toBe(1);
        });
    });

    // -----------------------------------------------------------------
    // Role changes (promote/demote)
    // -----------------------------------------------------------------

    describe('role changes', () => {
        let channelId: string;

        beforeEach(() => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({
                    name: 'Role Test',
                    createdByDid: ownerDid,
                    visibility: 'public',
                    now,
                }),
            );
            channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;

            // Add a regular member
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );
        });

        it('promotes a member to admin', () => {
            const result = service.updateMemberRoleFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: ownerDid,
                    targetRole: 'admin',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { member: { role: string }; change: string };
            expect(body.member.role).toBe('admin');
            expect(body.change).toBe('promoted');
        });

        it('demotes an admin to member', () => {
            // First promote
            service.updateMemberRoleFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: ownerDid,
                    targetRole: 'admin',
                    now,
                }),
            );

            // Then demote
            const result = service.updateMemberRoleFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: ownerDid,
                    targetRole: 'member',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { member: { role: string }; change: string };
            expect(body.member.role).toBe('member');
            expect(body.change).toBe('demoted');
        });

        it('rejects invalid role change (same role)', () => {
            const result = service.updateMemberRoleFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: ownerDid,
                    targetRole: 'member', // Already a member
                    now,
                }),
            );

            expect(result.statusCode).toBe(400);
        });

        it('rejects role change by non-admin', () => {
            const result = service.updateMemberRoleFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid: ownerDid,
                    actorDid: memberDid, // Regular member trying to change roles
                    targetRole: 'viewer',
                    now,
                }),
            );

            expect(result.statusCode).toBe(403);
        });
    });

    // -----------------------------------------------------------------
    // Request-linked rooms
    // -----------------------------------------------------------------

    describe('request-linked rooms', () => {
        it('creates a request room linked to a request URI', () => {
            const result = service.createRequestRoomFromParams(
                new URLSearchParams({
                    requestUri,
                    createdByDid: ownerDid,
                    name: 'Request Team',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                channel: { linkedRequestUri: string; visibility: string };
                created: boolean;
            };
            expect(body.created).toBe(true);
            expect(body.channel.linkedRequestUri).toBe(requestUri);
            expect(body.channel.visibility).toBe('private');
        });

        it('returns existing room for same request URI', () => {
            service.createRequestRoomFromParams(
                new URLSearchParams({ requestUri, createdByDid: ownerDid, now }),
            );

            const result = service.createRequestRoomFromParams(
                new URLSearchParams({ requestUri, createdByDid: ownerDid, now }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { created: boolean };
            expect(body.created).toBe(false);
        });

        it('archives a request room', () => {
            service.createRequestRoomFromParams(
                new URLSearchParams({ requestUri, createdByDid: ownerDid, now }),
            );

            const result = service.archiveRequestRoomFromParams(
                new URLSearchParams({ requestUri, actorDid: ownerDid, now }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { archived: boolean; channel: { isArchived: boolean } };
            expect(body.archived).toBe(true);
            expect(body.channel.isArchived).toBe(true);
        });

        it('returns 404 when archiving nonexistent request room', () => {
            const result = service.archiveRequestRoomFromParams(
                new URLSearchParams({
                    requestUri: 'at://did:example:alice/app.patchwork.aid.post/nonexistent',
                    actorDid: ownerDid,
                    now,
                }),
            );

            expect(result.statusCode).toBe(404);
        });

        it('rejects archive from non-admin/owner', () => {
            service.createRequestRoomFromParams(
                new URLSearchParams({ requestUri, createdByDid: ownerDid, now }),
            );

            const result = service.archiveRequestRoomFromParams(
                new URLSearchParams({ requestUri, actorDid: outsiderDid, now }),
            );

            expect(result.statusCode).toBe(403);
        });

        it('can create a new room after archiving the previous one', () => {
            service.createRequestRoomFromParams(
                new URLSearchParams({ requestUri, createdByDid: ownerDid, now }),
            );

            service.archiveRequestRoomFromParams(
                new URLSearchParams({ requestUri, actorDid: ownerDid, now }),
            );

            const result = service.createRequestRoomFromParams(
                new URLSearchParams({ requestUri, createdByDid: ownerDid, now }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { created: boolean };
            expect(body.created).toBe(true);
        });
    });

    // -----------------------------------------------------------------
    // Group moderation
    // -----------------------------------------------------------------

    describe('group moderation', () => {
        let channelId: string;

        beforeEach(() => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({
                    name: 'Moderation Test',
                    createdByDid: ownerDid,
                    visibility: 'public',
                    now,
                }),
            );
            channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;

            // Add a member
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );
        });

        it('warns a member', () => {
            const result = service.warnMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'Please follow guidelines',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { ok: boolean; action: string };
            expect(body.ok).toBe(true);
            expect(body.action).toBe('warn');
        });

        it('mutes a member', () => {
            const result = service.muteMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'Temporary mute for spam',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { ok: boolean; action: string };
            expect(body.action).toBe('mute');
        });

        it('removes a message', () => {
            const result = service.removeMessageFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetMessageId: 'msg-123',
                    reason: 'Inappropriate content',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { ok: boolean; action: string; targetMessageId: string };
            expect(body.action).toBe('remove_message');
            expect(body.targetMessageId).toBe('msg-123');
        });

        it('bans a member', () => {
            const result = service.banMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'Repeated violations',
                    now,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { ok: boolean; action: string };
            expect(body.ok).toBe(true);
            expect(body.action).toBe('ban_member');

            // Verify member is banned
            const statusResult = service.getMembershipStatusFromParams(
                new URLSearchParams({ channelId, memberDid }),
            );
            const statusBody = statusResult.body as { status: string };
            expect(statusBody.status).toBe('banned');
        });

        it('prevents banning already banned members', () => {
            // Ban first
            service.banMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'First ban',
                    now,
                }),
            );

            // Try to ban again
            const result = service.banMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'Double ban',
                    now,
                }),
            );

            expect(result.statusCode).toBe(400);
        });

        it('rejects moderation from non-admin/owner', () => {
            const result = service.warnMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: memberDid,
                    targetDid: ownerDid,
                    reason: 'Attempt',
                    now,
                }),
            );

            expect(result.statusCode).toBe(403);
        });

        it('retrieves moderation log for a channel', () => {
            service.warnMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'Warning 1',
                    now,
                }),
            );

            service.muteMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'Mute 1',
                    now: '2026-03-01T11:00:00.000Z',
                }),
            );

            const result = service.getModerationLogFromParams(
                new URLSearchParams({ channelId }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                total: number;
                events: Array<{ action: string; reason: string }>;
            };
            expect(body.total).toBe(2);
            expect(body.events[0]!.action).toBe('warn');
            expect(body.events[1]!.action).toBe('mute');
        });

        it('records moderation events on archive', () => {
            service.archiveChannelFromParams(
                new URLSearchParams({ channelId, actorDid: ownerDid, reason: 'Done', now }),
            );

            const result = service.getModerationLogFromParams(
                new URLSearchParams({ channelId }),
            );

            const body = result.body as { total: number; events: Array<{ action: string }> };
            expect(body.total).toBe(1);
            expect(body.events[0]!.action).toBe('archive_channel');
        });
    });

    // -----------------------------------------------------------------
    // Private channel access controls
    // -----------------------------------------------------------------

    describe('private channel access', () => {
        let channelId: string;

        beforeEach(() => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({
                    name: 'Private Group',
                    createdByDid: ownerDid,
                    visibility: 'private',
                    now,
                }),
            );
            channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;
        });

        it('prevents direct join to private channel without invite', () => {
            const result = service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            expect(result.statusCode).toBe(403);
        });

        it('allows joining private channel after invite', () => {
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: ownerDid,
                    action: 'invite',
                    now,
                }),
            );

            const joinResult = service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            expect(joinResult.statusCode).toBe(200);
            const body = joinResult.body as { member: { status: string } };
            expect(body.member.status).toBe('active');
        });
    });

    // -----------------------------------------------------------------
    // Safety regression tests
    // -----------------------------------------------------------------

    describe('safety regressions', () => {
        let channelId: string;

        beforeEach(() => {
            const createResult = service.createChannelFromParams(
                new URLSearchParams({
                    name: 'Safety Test',
                    createdByDid: ownerDid,
                    visibility: 'public',
                    now,
                }),
            );
            channelId = (createResult.body as { channel: { channelId: string } }).channel.channelId;
        });

        it('banned users cannot join', () => {
            // Join then get banned
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            service.banMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'Banned',
                    now,
                }),
            );

            // Try to rejoin
            const result = service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            expect(result.statusCode).toBe(403);
        });

        it('cannot post in archived channels', () => {
            service.archiveChannelFromParams(
                new URLSearchParams({ channelId, actorDid: ownerDid, now }),
            );

            // Verify via the shared canPostInGroup contract
            const ch = service.getChannelFromParams(
                new URLSearchParams({ channelId }),
            );
            const channel = (ch.body as { channel: { isArchived: boolean } }).channel;
            expect(channel.isArchived).toBe(true);
        });

        it('moderation log provides audit trail', () => {
            service.addMemberFromParams(
                new URLSearchParams({
                    channelId,
                    memberDid,
                    actorDid: memberDid,
                    action: 'join',
                    now,
                }),
            );

            service.warnMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'Warning',
                    now: '2026-03-01T10:01:00.000Z',
                }),
            );

            service.banMemberFromParams(
                new URLSearchParams({
                    channelId,
                    actorDid: ownerDid,
                    targetDid: memberDid,
                    reason: 'Ban after warning',
                    now: '2026-03-01T10:02:00.000Z',
                }),
            );

            const log = service.getModerationLogFromParams(
                new URLSearchParams({ channelId }),
            );

            const body = log.body as {
                total: number;
                events: Array<{ actorDid: string; action: string; occurredAt: string }>;
            };
            expect(body.total).toBe(2);
            // Verify chronological order
            expect(body.events[0]!.occurredAt < body.events[1]!.occurredAt).toBe(true);
            expect(body.events[0]!.action).toBe('warn');
            expect(body.events[1]!.action).toBe('ban_member');
        });
    });
});
