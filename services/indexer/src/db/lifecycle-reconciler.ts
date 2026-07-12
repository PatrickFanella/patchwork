import { createHash } from 'node:crypto';
import { recordNsid, type NormalizedFirehoseEvent } from '@patchwork/shared';
import type { Pool, PoolClient } from 'pg';

type PrivateStatus =
    | 'open'
    | 'triaged'
    | 'assigned'
    | 'in_progress'
    | 'resolved'
    | 'archived';
type PublicStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

const authorFromUri = (uri: string): string => {
    const match = /^at:\/\/([^/]+)\//.exec(uri);
    if (!match?.[1]) throw new Error('Repository event URI has no author DID.');
    return match[1];
};

const hash = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

export class PostgresLifecycleEventReconciler {
    constructor(private readonly pool: Pool) {}

    async reconcile(event: NormalizedFirehoseEvent): Promise<void> {
        if (event.collection !== recordNsid.aidPost) return;
        const actorDid = authorFromUri(event.uri);
        if (actorDid !== event.authorDid) {
            throw new Error('Repository event author does not match its AT URI.');
        }
        if (event.action !== 'delete') {
            if (event.payload?.kind !== 'aid-post') return;
            await this.reconcileStatus(event, actorDid, event.payload.status);
            return;
        }

        const commandId = `stream-delete:${event.eventId}`;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                event.uri,
            ]);
            if (!(await this.isCurrentProjectionEvent(client, event))) {
                await client.query('COMMIT');
                return;
            }
            const duplicate = await client.query(
                `SELECT audit_event_id
                 FROM operational_audit_events
                 WHERE command_id = $1
                   AND action = 'request.record_deleted'`,
                [commandId],
            );
            if (duplicate.rows[0]) {
                await client.query('COMMIT');
                return;
            }
            const deleted = await client.query(
                `DELETE FROM request_workflows
                 WHERE post_uri = $1
                 RETURNING post_uri`,
                [event.uri],
            );
            if (deleted.rowCount === 0) {
                await client.query('COMMIT');
                return;
            }
            const occurredAt = event.receivedAt;
            const retentionUntil = new Date(
                new Date(occurredAt).getTime() + 365 * 24 * 60 * 60 * 1_000,
            ).toISOString();
            await client.query(
                `INSERT INTO operational_audit_events (
                    command_id, actor_did, action, subject_uri, payload,
                    retention_until, occurred_at
                 ) VALUES (
                    $1, $2, 'request.record_deleted', $3,
                    '{"source":"at-repository-event","removed":true}'::jsonb,
                    $4, $5
                 )`,
                [commandId, actorDid, event.uri, retentionUntil, occurredAt],
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async reconcileStatus(
        event: NormalizedFirehoseEvent,
        actorDid: string,
        publicStatus: PublicStatus,
    ): Promise<void> {
        const commandId = `stream-status:${event.eventId}`;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                event.uri,
            ]);
            if (!(await this.isCurrentProjectionEvent(client, event))) {
                await client.query('COMMIT');
                return;
            }
            const duplicate = await client.query(
                `SELECT audit_event_id
                 FROM operational_audit_events
                 WHERE command_id = $1
                   AND action IN (
                       'request.repository_status_reconciled',
                       'request.repository_status_diverged'
                   )`,
                [commandId],
            );
            if (duplicate.rows[0]) {
                await client.query('COMMIT');
                return;
            }
            const workflow = await client.query<{
                current_status: PrivateStatus;
            }>(
                `SELECT current_status
                 FROM request_workflows
                 WHERE post_uri = $1
                 FOR UPDATE`,
                [event.uri],
            );
            const currentStatus = workflow.rows[0]?.current_status;
            if (!currentStatus) {
                await client.query('COMMIT');
                return;
            }

            const targetStatus = this.compatibleTarget(currentStatus, publicStatus);
            const diverged = targetStatus === undefined;
            if (!diverged && targetStatus !== currentStatus) {
                await client.query(
                    `INSERT INTO request_transition_events (
                        command_id, post_uri, actor_did, actor_role,
                        from_status, to_status, reason, occurred_at
                     ) VALUES ($1, $2, $3, 'requester', $4, $5,
                               'AT repository event reconciliation', $6)`,
                    [
                        commandId,
                        event.uri,
                        actorDid,
                        currentStatus,
                        targetStatus,
                        event.receivedAt,
                    ],
                );
            }
            await client.query(
                `UPDATE request_workflows
                 SET current_status = $2,
                     public_status = $3,
                     public_cid = $4,
                     public_synced_at = CASE WHEN $5 THEN public_synced_at ELSE $6 END,
                     public_sync_state = CASE WHEN $5 THEN 'failed' ELSE 'synced' END,
                     public_sync_error_code = CASE
                         WHEN $5 THEN 'PUBLIC_STATUS_DIVERGED'
                         ELSE NULL
                     END,
                     public_sync_attempted_at = $6,
                     updated_at = GREATEST(updated_at, $6)
                 WHERE post_uri = $1`,
                [
                    event.uri,
                    targetStatus ?? currentStatus,
                    publicStatus,
                    event.cid ?? null,
                    diverged,
                    event.receivedAt,
                ],
            );
            const retentionUntil = new Date(
                new Date(event.receivedAt).getTime() + 365 * 24 * 60 * 60 * 1_000,
            ).toISOString();
            await client.query(
                `INSERT INTO operational_audit_events (
                    command_id, actor_did, action, subject_uri, payload,
                    retention_until, occurred_at
                 ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
                [
                    commandId,
                    actorDid,
                    diverged ?
                        'request.repository_status_diverged'
                    :   'request.repository_status_reconciled',
                    event.uri,
                    JSON.stringify({
                        fromStatus: currentStatus,
                        toStatus: targetStatus ?? currentStatus,
                        publicStatus,
                        ...(event.cid ? { publicCid: event.cid } : {}),
                    }),
                    retentionUntil,
                    event.receivedAt,
                ],
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private compatibleTarget(
        current: PrivateStatus,
        observed: PublicStatus,
    ): PrivateStatus | undefined {
        if (observed === 'closed') return 'archived';
        if (observed === 'resolved') {
            return current === 'archived' ? undefined : 'resolved';
        }
        if (observed === 'in-progress') {
            return current === 'assigned' || current === 'in_progress' ?
                    'in_progress'
                :   undefined;
        }
        return current === 'open' ? 'open' : undefined;
    }

    private async isCurrentProjectionEvent(
        client: PoolClient,
        event: NormalizedFirehoseEvent,
    ): Promise<boolean> {
        if (event.action === 'delete') {
            const tombstone = await client.query<{ source_cursor: string }>(
                `SELECT source_cursor
                 FROM indexer_projection_tombstones
                 WHERE uri_hash = $1`,
                [hash(event.uri)],
            );
            return Number(tombstone.rows[0]?.source_cursor) === event.seq;
        }
        const projection = await client.query<{
            source_cursor: string;
            source_event_id: string;
        }>(
            `SELECT source_cursor, source_event_id
             FROM indexer_aid_post_projections
             WHERE uri = $1`,
            [event.uri],
        );
        return (
            Number(projection.rows[0]?.source_cursor) === event.seq &&
            projection.rows[0]?.source_event_id === event.eventId
        );
    }
}
