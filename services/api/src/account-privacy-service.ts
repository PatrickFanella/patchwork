import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

const hash = (value: string): string =>
    createHash('sha256').update(value).digest('hex');
const iso = (value: Date | string | null): string | null =>
    value === null ? null : new Date(value).toISOString();

export class AccountPrivacyService {
    constructor(private readonly pool: Pool) {}

    async exportFor(did: string): Promise<Record<string, unknown>> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const result = await this.collect(client, did);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async collect(
        client: PoolClient,
        did: string,
    ): Promise<Record<string, unknown>> {
        const oauth = await client.query<{
                handle: string | null;
                token_expires_at: Date | string | null;
                revoked_at: Date | string | null;
                created_at: Date | string;
                updated_at: Date | string;
            }>(
            `SELECT handle, token_expires_at, revoked_at, created_at, updated_at
             FROM at_oauth_sessions WHERE did = $1`,
            [did],
        );
        const browserSessions = await client.query<{
                expires_at: Date | string;
                revoked_at: Date | string | null;
                created_at: Date | string;
                last_seen_at: Date | string;
            }>(
            `SELECT expires_at, revoked_at, created_at, last_seen_at
             FROM patchwork_browser_sessions
             WHERE did = $1 ORDER BY created_at`,
            [did],
        );
        const role = await client.query<{
            role: string;
            updated_at: Date | string;
        }>(
            `SELECT role, updated_at FROM platform_roles WHERE did = $1`,
            [did],
        );
        const publicAidPosts = await client.query<{
                uri: string;
                cid: string | null;
                title: string;
                description: string;
                category: string;
                urgency: string;
                status: string;
                latitude: number;
                longitude: number;
                precision_km: number;
                record_created_at: Date | string;
                record_updated_at: Date | string;
            }>(
            `SELECT uri, cid, title, description, category, urgency, status,
                    latitude, longitude, precision_km, record_created_at,
                    record_updated_at
             FROM indexer_aid_post_projections
             WHERE author_did_hash = $1
             ORDER BY record_created_at, uri`,
            [hash(did)],
        );
        const workflows = await client.query<{
                post_uri: string;
                current_status: string;
                public_status: string | null;
                created_at: Date | string;
                updated_at: Date | string;
                retention_until: Date | string | null;
            }>(
            `SELECT post_uri, current_status, public_status, created_at,
                    updated_at, retention_until
             FROM request_workflows
             WHERE requester_did = $1 ORDER BY created_at, post_uri`,
            [did],
        );
        const lifecycleActions = await client.query<{
                post_uri: string;
                from_status: string;
                to_status: string;
                reason: string | null;
                occurred_at: Date | string;
            }>(
            `SELECT post_uri, from_status, to_status, reason, occurred_at
             FROM request_transition_events
             WHERE actor_did = $1 ORDER BY occurred_at, transition_id`,
            [did],
        );
        const assignmentActions = await client.query<{
                post_uri: string;
                involvement: string;
                occurred_at: Date | string;
            }>(
            `SELECT post_uri,
                    CASE WHEN assigner_did = $1 THEN 'assigner' ELSE 'assignee' END
                        AS involvement,
                    occurred_at
             FROM request_assignment_events
             WHERE assigner_did = $1 OR assignee_did = $1
             ORDER BY occurred_at, assignment_event_id`,
            [did],
        );
        const handoffActions = await client.query<{
            post_uri: string;
            occurred_at: Date | string;
        }>(
            `SELECT post_uri, occurred_at
             FROM request_handoff_events
             WHERE completed_by = $1 ORDER BY occurred_at, handoff_event_id`,
            [did],
        );
        const blocksCreated = await client.query<{
                reason: string | null;
                created_at: Date | string;
                deleted_at: Date | string | null;
                retention_until: Date | string | null;
            }>(
            `SELECT reason, created_at, deleted_at, retention_until
             FROM user_blocks WHERE blocker_did = $1 ORDER BY created_at, block_id`,
            [did],
        );
        const reportsSubmitted = await client.query<{
                reason: string;
                details: string | null;
                status: string;
                created_at: Date | string;
                deleted_at: Date | string | null;
                retention_until: Date | string;
            }>(
            `SELECT reason, details, status, created_at, deleted_at,
                    retention_until
             FROM abuse_reports
             WHERE reporter_did = $1 ORDER BY created_at, report_id`,
            [did],
        );
        const operationalActions = await client.query<{
                action: string;
                occurred_at: Date | string;
                retention_until: Date | string;
            }>(
            `SELECT action, occurred_at, retention_until
             FROM operational_audit_events
             WHERE actor_did = $1 ORDER BY occurred_at, audit_event_id`,
            [did],
        );
        const commandMetadata = await client.query<{
                method: string;
                pathname: string;
                created_at: Date | string;
                completed_at: Date | string | null;
            }>(
            `SELECT method, pathname, created_at, completed_at
             FROM http_idempotency_commands
             WHERE actor_did = $1 ORDER BY created_at, idempotency_key`,
            [did],
        );
        const oauthRow = oauth.rows[0];
        const roleRow = role.rows[0];

        return {
            formatVersion: '1.0',
            generatedAt: new Date().toISOString(),
            subject: {
                did,
                ...(oauthRow?.handle ? { handle: oauthRow.handle } : {}),
            },
            data: {
                authentication:
                    oauthRow ?
                        {
                            tokenExpiresAt: iso(oauthRow.token_expires_at),
                            revokedAt: iso(oauthRow.revoked_at),
                            createdAt: iso(oauthRow.created_at),
                            updatedAt: iso(oauthRow.updated_at),
                            browserSessions: browserSessions.rows.map(row => ({
                                expiresAt: iso(row.expires_at),
                                revokedAt: iso(row.revoked_at),
                                createdAt: iso(row.created_at),
                                lastSeenAt: iso(row.last_seen_at),
                            })),
                        }
                    :   null,
                platformRole:
                    roleRow ?
                        { role: roleRow.role, grantedAt: iso(roleRow.updated_at) }
                    :   { role: 'user', grantedAt: null },
                publicAidPosts: publicAidPosts.rows.map(row => ({
                    uri: row.uri,
                    cid: row.cid,
                    title: row.title,
                    description: row.description,
                    category: row.category,
                    urgency: row.urgency,
                    status: row.status,
                    approximateGeo: {
                        latitude: Number(row.latitude),
                        longitude: Number(row.longitude),
                        precisionKm: Number(row.precision_km),
                    },
                    createdAt: iso(row.record_created_at),
                    updatedAt: iso(row.record_updated_at),
                })),
                workflows: workflows.rows.map(row => ({
                    postUri: row.post_uri,
                    currentStatus: row.current_status,
                    publicStatus: row.public_status,
                    createdAt: iso(row.created_at),
                    updatedAt: iso(row.updated_at),
                    retentionUntil: iso(row.retention_until),
                })),
                lifecycleActions: lifecycleActions.rows.map(row => ({
                    postUri: row.post_uri,
                    fromStatus: row.from_status,
                    toStatus: row.to_status,
                    reason: row.reason,
                    occurredAt: iso(row.occurred_at),
                })),
                assignmentActions: assignmentActions.rows.map(row => ({
                    postUri: row.post_uri,
                    involvement: row.involvement,
                    occurredAt: iso(row.occurred_at),
                })),
                handoffActions: handoffActions.rows.map(row => ({
                    postUri: row.post_uri,
                    occurredAt: iso(row.occurred_at),
                })),
                blocksCreated: blocksCreated.rows.map(row => ({
                    reason: row.reason,
                    createdAt: iso(row.created_at),
                    deletedAt: iso(row.deleted_at),
                    retentionUntil: iso(row.retention_until),
                })),
                reportsSubmitted: reportsSubmitted.rows.map(row => ({
                    reason: row.reason,
                    details: row.details,
                    status: row.status,
                    createdAt: iso(row.created_at),
                    deletedAt: iso(row.deleted_at),
                    retentionUntil: iso(row.retention_until),
                })),
                operationalActions: operationalActions.rows.map(row => ({
                    action: row.action,
                    occurredAt: iso(row.occurred_at),
                    retentionUntil: iso(row.retention_until),
                })),
                commandMetadata: commandMetadata.rows.map(row => ({
                    method: row.method,
                    pathname: row.pathname,
                    createdAt: iso(row.created_at),
                    completedAt: iso(row.completed_at),
                })),
            },
            exclusions: [
                {
                    category: 'at-repository',
                    reason:
                        'The public aid-post section is a Patchwork projection, not a complete AT repository export.',
                },
                {
                    category: 'moderation-casework',
                    reason:
                        'Private casework may contain third-party or safety data and requires controlled review.',
                },
                {
                    category: 'credentials',
                    reason:
                        'Tokens, encrypted OAuth payloads, session identifiers, and lookup hashes are never exported.',
                },
            ],
        };
    }
}
