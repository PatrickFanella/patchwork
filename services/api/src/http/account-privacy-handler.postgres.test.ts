import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountPrivacyService } from '../account-privacy-service.js';
import { authenticateRequest } from './authenticated-request.js';
import { createAccountPrivacyHandler } from './account-privacy-handler.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const viewerDid = 'did:plc:privacyviewer';
const otherDid = 'did:plc:privacyother';
const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex');

const startServer = async (pool: Pool) => {
    const handler = createAccountPrivacyHandler({
        service: new AccountPrivacyService(pool),
        authenticate: request =>
            authenticateRequest(request, {
                resolveSession: async token => {
                    if (token !== 'privacy-session') throw new Error('bad session');
                    return { did: viewerDid };
                },
                resolveRole: async () => 'user',
            }),
    });
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (!handler(request, response, url)) response.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    return { server, origin: `http://127.0.0.1:${address.port}` };
};

const stopServer = async (server: Server) => {
    server.close();
    await once(server, 'close');
};

describePostgres('authenticated account privacy HTTP boundary', () => {
    const pool = new Pool({ connectionString: databaseUrl });

    beforeAll(async () => {
        for (const migration of [
            '0002_at_sessions.sql',
            '0003_core_operational_state.sql',
            '0004_lifecycle_timeline.sql',
            '0005_lifecycle_assignments.sql',
            '0006_assignment_responses.sql',
            '0007_lifecycle_handoffs.sql',
            '0008_platform_roles.sql',
            '0009_public_status_sync.sql',
            '0010_public_sync_state.sql',
            '0011_http_idempotency.sql',
        ]) {
            await pool.query(
                await readFile(
                    new URL(`../db/migrations/${migration}`, import.meta.url),
                    'utf8',
                ),
            );
        }
        await pool.query(
            await readFile(
                new URL('../../../indexer/src/migrations/0002_projection_store.sql', import.meta.url),
                'utf8',
            ),
        );
        await pool.query(
            `TRUNCATE patchwork_browser_sessions, at_oauth_sessions,
                      platform_roles, operational_audit_events, abuse_reports,
                      user_blocks, request_handoff_events,
                      request_assignment_events, request_transition_events,
                      request_workflows, http_idempotency_commands,
                      indexer_projection_events,
                      indexer_projection_tombstones,
                      indexer_aid_post_projections RESTART IDENTITY CASCADE`,
        );
        await pool.query(
            `INSERT INTO at_oauth_sessions (
                did, handle, encrypted_payload, created_at, updated_at
             ) VALUES
                ($1, 'viewer.test', 'encrypted-secret-payload', NOW(), NOW()),
                ($2, 'other.test', 'other-secret-payload', NOW(), NOW())`,
            [viewerDid, otherDid],
        );
        await pool.query(
            `INSERT INTO patchwork_browser_sessions (
                session_id_hash, did, expires_at
             ) VALUES ('private-session-hash', $1, NOW() + INTERVAL '1 day')`,
            [viewerDid],
        );
        await pool.query(
            `INSERT INTO request_workflows (
                post_uri, requester_did, current_status, create_command_id,
                created_at, updated_at
             ) VALUES
                ('at://did:plc:privacyviewer/app.patchwork.aid.post/one', $1,
                 'open', 'privacy-workflow', NOW(), NOW()),
                ('at://did:plc:privacyother/app.patchwork.aid.post/two', $2,
                 'open', 'other-workflow', NOW(), NOW())`,
            [viewerDid, otherDid],
        );
        await pool.query(
            `INSERT INTO indexer_aid_post_projections (
                uri, collection, author_did_hash, title, description,
                category, urgency, status, searchable_text, latitude,
                longitude, precision_km, record_created_at, record_updated_at,
                source_cursor, source_event_id
             ) VALUES
                ('at://did:plc:privacyviewer/app.patchwork.aid.post/one',
                 'app.patchwork.aid.post', $1, 'My aid post', 'Public body',
                 'food', 'low', 'open', 'my aid post public body', 0, 0, 5,
                 NOW(), NOW(), 1, 'privacy-event'),
                ('at://did:plc:privacyother/app.patchwork.aid.post/two',
                 'app.patchwork.aid.post', $2, 'Other aid post', 'Do not export',
                 'food', 'low', 'open', 'other aid post do not export', 0, 0, 5,
                 NOW(), NOW(), 2, 'other-event')`,
            [hash(viewerDid), hash(otherDid)],
        );
    });

    afterAll(async () => {
        await pool.end();
    });

    it('exports only session-derived subject data without credential material', async () => {
        const running = await startServer(pool);
        const response = await fetch(`${running.origin}/account/export`, {
            headers: { cookie: 'patchwork_session=privacy-session' },
        });
        const body = await response.json();
        await stopServer(running.server);

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('content-disposition')).toBe(
            'attachment; filename="patchwork-account-export.json"',
        );
        expect(body).toMatchObject({
            formatVersion: '1.0',
            subject: { did: viewerDid, handle: 'viewer.test' },
            data: {
                publicAidPosts: [
                    expect.objectContaining({ title: 'My aid post' }),
                ],
                workflows: [
                    expect.objectContaining({ currentStatus: 'open' }),
                ],
            },
            exclusions: expect.arrayContaining([
                expect.objectContaining({ category: 'at-repository' }),
                expect.objectContaining({ category: 'moderation-casework' }),
            ]),
        });
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain('encrypted-secret-payload');
        expect(serialized).not.toContain('private-session-hash');
        expect(serialized).not.toContain('Other aid post');
        expect(serialized).not.toContain(otherDid);
    });

    it('rejects export without an authenticated browser session', async () => {
        const running = await startServer(pool);
        const response = await fetch(`${running.origin}/account/export`);
        await stopServer(running.server);

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'AUTHENTICATION_REQUIRED' },
        });
    });
});
