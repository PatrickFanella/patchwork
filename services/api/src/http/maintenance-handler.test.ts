import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import type { MaintenanceModeService } from '../maintenance-mode-service.js';
import { createMaintenanceHandler, isBlockedByMaintenance } from './maintenance-handler.js';

describe('maintenance HTTP boundary', () => {
    let origin: string;
    let server: ReturnType<typeof createServer>;
    const declare = vi.fn().mockResolvedValue({ active: true });
    const resume = vi.fn().mockResolvedValue({ active: false });
    let role: 'user' | 'moderator' = 'moderator';
    let authenticatedAt = new Date().toISOString();
    const handler = createMaintenanceHandler({
        service: {
            status: () => ({
                active: false,
                reasonCodes: [],
                publicMessage: 'Patchwork is operating normally.',
                environmentOverride: false,
            }),
            declare,
            resume,
        } as unknown as MaintenanceModeService,
        authenticate: async () => ({
            sessionToken: 'opaque',
            session: {
                did: 'did:plc:session-owner',
                expiresAt: '2099-01-01T00:00:00.000Z',
                authenticatedAt,
            },
            principal: {
                did: 'did:plc:session-owner',
                role,
                authorization: {
                    actorDid: 'did:plc:session-owner',
                    role,
                    capabilities:
                        role === 'moderator' ?
                            ['maintenance_mode:manage' as const]
                        :   [],
                },
            },
        }),
        executeIdempotent: async (_request, _did, body, effect) =>
            effect(body as Record<string, unknown>, 'idempotency-one'),
    });

    beforeAll(async () => {
        server = createServer((request, response) => {
            if (!handler(
                request,
                response,
                new URL(request.url ?? '/', 'http://localhost'),
            )) response.writeHead(404).end();
        });
        await new Promise<void>(resolve =>
            server.listen(0, '127.0.0.1', resolve),
        );
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('no address');
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close(error => error ? reject(error) : resolve()),
        );
    });

    it('keeps the public status readable without authentication', async () => {
        const response = await fetch(`${origin}/status`);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            maintenance: { active: false },
        });
    });

    it('derives the moderator actor from the session and rejects invalid commands', async () => {
        role = 'moderator';
        declare.mockRejectedValueOnce(new ZodError([]));
        const invalid = await fetch(`${origin}/maintenance/declare`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorDid: 'did:plc:attacker' }),
        });
        expect(invalid.status).toBe(400);

        const response = await fetch(`${origin}/maintenance/declare`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                actorDid: 'did:plc:attacker',
                reasonCodes: ['privacy'],
                publicMessage: 'Submissions are paused.',
            }),
        });
        expect(response.status).toBe(200);
        expect(declare).toHaveBeenCalledWith(
            'did:plc:session-owner',
            expect.objectContaining({ reasonCodes: ['privacy'] }),
            'idempotency-one',
        );
    });

    it('denies maintenance controls without the moderator capability', async () => {
        role = 'user';
        const response = await fetch(`${origin}/maintenance`);
        expect(response.status).toBe(403);
    });

    it('requires a fresh AT OAuth login for both maintenance transitions', async () => {
        role = 'moderator';
        authenticatedAt = new Date(Date.now() - 5 * 60 * 1000 - 1).toISOString();
        const stale = await fetch(`${origin}/maintenance/declare`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                reasonCodes: ['integrity'],
                publicMessage: 'Checking service integrity.',
            }),
        });
        expect(stale.status).toBe(401);
        await expect(stale.json()).resolves.toMatchObject({
            error: { code: 'MAINTENANCE_STEP_UP_REQUIRED' },
        });

        authenticatedAt = new Date().toISOString();
        const fresh = await fetch(`${origin}/maintenance/resume`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(fresh.status).toBe(200);
        expect(resume).toHaveBeenCalledWith(
            'did:plc:session-owner',
            'idempotency-one',
        );
    });

    it('classifies every new-submission and exact-exchange write as blocked', () => {
        for (const path of [
            '/at/aid-posts',
            '/at/directory-resources',
            '/at/volunteer-profile',
            '/organizations',
            '/verification/applications',
            '/verification/appeals',
            '/verification/exact-address/requests',
            '/attachments/uploads',
            '/coordination/offers',
            '/groups',
            '/groups/invitations',
            '/groups/invitation-responses',
            '/groups/invitation-revocations',
            '/groups/member-removals',
            '/groups/role-changes',
            '/groups/departures',
            '/groups/ownership-transfers',
            '/groups/closures',
            '/groups/rooms',
            '/groups/room-closures',
            '/chat/conversations',
            '/chat/messages',
            '/chat/read',
            '/chat/messages/redactions',
            '/chat/reports',
            '/location/consent',
            '/location/signal',
            '/location/revoke',
        ]) {
            expect(isBlockedByMaintenance(
                { method: 'POST' } as never,
                new URL(path, 'http://localhost'),
            )).toBe(true);
        }
        expect(isBlockedByMaintenance(
            { method: 'GET' } as never,
            new URL('/feed', 'http://localhost'),
        )).toBe(false);
    });
});
