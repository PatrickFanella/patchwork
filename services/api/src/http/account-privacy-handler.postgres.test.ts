import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountPrivacyService } from '../account-privacy-service.js';
import { authenticateRequest } from './authenticated-request.js';
import { createAccountPrivacyHandler } from './account-privacy-handler.js';
import {
    idempotencyKeyFromRequest,
    withIdempotencyKey,
} from './idempotent-request.js';
import { PostgresIdempotencyExecutor } from './idempotency-store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const viewerDid = 'did:plc:privacyviewer';
const otherDid = 'did:plc:privacyother';
const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex');

const startServer = async (pool: Pool) => {
    const idempotency = new PostgresIdempotencyExecutor(pool);
    const handler = createAccountPrivacyHandler({
        service: new AccountPrivacyService(pool),
        authenticate: request =>
            authenticateRequest(request, {
                resolveSession: async token => {
                    if (token === 'privacy-session') return { did: viewerDid };
                    if (token === 'other-session') return { did: otherDid };
                    throw new Error('bad session');
                },
                resolveRole: async () => 'user',
            }),
        clearSessionCookies: response => {
            response.setHeader('set-cookie', [
                'patchwork_session=; Path=/; HttpOnly; Max-Age=0',
                'patchwork_csrf=; Path=/; Max-Age=0',
            ]);
        },
        executeIdempotent: (request, actorDid, body, effect) => {
            const key = idempotencyKeyFromRequest(request);
            const commandBody = withIdempotencyKey(body, key);
            const pathname = new URL(
                request.url ?? '/',
                'http://localhost',
            ).pathname;
            return idempotency.execute(
                {
                    actorDid,
                    method: request.method ?? 'POST',
                    pathname,
                    idempotencyKey: key,
                    body: commandBody,
                },
                () => effect(commandBody),
            );
        },
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
            '0012_retention_enforcement.sql',
            '0013_account_deactivation.sql',
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
        for (const migration of [
            '001_create_moderation_tables.sql',
            '002_durable_moderation.sql',
            '003_retention_enforcement.sql',
        ]) {
            await pool.query(
                await readFile(
                    new URL(
                        `../../../moderation-worker/src/migrations/${migration}`,
                        import.meta.url,
                    ),
                    'utf8',
                ),
            );
        }
        await pool.query(
            `TRUNCATE patchwork_browser_sessions, at_oauth_sessions,
                      platform_roles, operational_audit_events, abuse_reports,
                      user_blocks, request_handoff_events,
                      request_assignment_events, request_transition_events,
                      request_workflows, http_idempotency_commands,
                      account_deactivations, moderation_audit_records,
                      moderation_queue_items,
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
        await pool.query(
            `INSERT INTO user_blocks (
                command_id, blocker_did, subject_did, reason,
                retention_until, created_at
             ) VALUES
                ('viewer-owned-block', $1, $2, 'owned detail',
                 NOW() + INTERVAL '30 days', NOW()),
                ('viewer-subject-block', $2, $1, 'safety detail',
                 NOW() + INTERVAL '30 days', NOW())`,
            [viewerDid, otherDid],
        );
        await pool.query(
            `INSERT INTO abuse_reports (
                command_id, reporter_did, subject_uri, subject_did, reason,
                details, retention_until, created_at
             ) VALUES (
                'viewer-report', $1,
                'at://did:plc:privacyother/app.patchwork.aid.post/two', $2,
                'safety', 'private report detail',
                NOW() + INTERVAL '30 days', NOW()
             )`,
            [viewerDid, otherDid],
        );
        await pool.query(
            `INSERT INTO operational_audit_events (
                command_id, actor_did, action, subject_uri, payload,
                retention_until, occurred_at
             ) VALUES (
                'viewer-audit', $1, 'privacy-test',
                'at://did:plc:privacyviewer/app.patchwork.aid.post/one',
                '{"safe":true}', NOW() + INTERVAL '90 days', NOW()
             )`,
            [viewerDid],
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

    it('deactivates only the authenticated subject and reports retained exceptions', async () => {
        const running = await startServer(pool);
        const response = await fetch(`${running.origin}/account/deactivate`, {
            method: 'POST',
            headers: {
                cookie: 'patchwork_session=privacy-session',
                'content-type': 'application/json',
                'idempotency-key': 'privacy-deactivate-1',
            },
            body: JSON.stringify({ did: otherDid }),
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('set-cookie')).toContain(
            'patchwork_session=; Path=/; HttpOnly; Max-Age=0',
        );
        expect(body).toMatchObject({
            status: 'deactivated',
            removed: { publicAidPosts: 1, workflows: 1 },
            revoked: { browserSessions: 1, oauthSessions: 1 },
            retained: expect.objectContaining({
                deactivationReceipt: 1,
                safetyBlocks: 1,
                safetyReports: 1,
                operationalAudit: 1,
            }),
        });
        expect(JSON.stringify(body)).not.toContain(viewerDid);
        expect(JSON.stringify(body)).not.toContain(otherDid);

        const reused = await fetch(`${running.origin}/account/deactivate`, {
            method: 'POST',
            headers: {
                cookie: 'patchwork_session=privacy-session',
                'content-type': 'application/json',
                'idempotency-key': 'privacy-deactivate-1',
            },
            body: JSON.stringify({ changed: true }),
        });
        expect(reused.status).toBe(409);
        await expect(reused.json()).resolves.toMatchObject({
            error: { code: 'IDEMPOTENCY_KEY_REUSED' },
        });

        const retained = await pool.query<{
            reason: string | null;
            details: string | null;
            actor_did: string;
        }>(
            `SELECT b.reason, r.details, a.actor_did
             FROM user_blocks b, abuse_reports r, operational_audit_events a
             WHERE b.subject_did = $1
               AND r.command_id = 'viewer-report'
               AND a.command_id = 'viewer-audit'`,
            [viewerDid],
        );
        expect(retained.rows[0]).toMatchObject({
            reason: null,
            details: null,
            actor_did: `deactivated:${hash(viewerDid)}`,
        });

        const viewerExport = (await fetch(`${running.origin}/account/export`, {
            headers: { cookie: 'patchwork_session=privacy-session' },
        }).then(result => result.json())) as {
            data: { publicAidPosts: unknown[]; workflows: unknown[] };
        };
        expect(viewerExport.data.publicAidPosts).toEqual([]);
        expect(viewerExport.data.workflows).toEqual([]);

        const otherExport = (await fetch(`${running.origin}/account/export`, {
            headers: { cookie: 'patchwork_session=other-session' },
        }).then(result => result.json())) as {
            data: { publicAidPosts: unknown[]; workflows: unknown[] };
        };
        expect(otherExport.data.publicAidPosts).toHaveLength(1);
        expect(otherExport.data.workflows).toHaveLength(1);
        await stopServer(running.server);
    });
});
