import type { Pool } from 'pg';

const PRIVATE_AUDIT_KEYS = new Set([
    'password',
    'accessJwt',
    'refreshJwt',
    'access_token',
    'refresh_token',
    'exactLatitude',
    'exactLongitude',
]);

export const sanitizeAuditPayload = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(sanitizeAuditPayload);
    }
    if (typeof value !== 'object' || value === null) {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !PRIVATE_AUDIT_KEYS.has(key))
            .map(([key, child]) => [key, sanitizeAuditPayload(child)]),
    );
};

export interface AppendAuditEventInput {
    commandId: string;
    actorDid?: string;
    action: string;
    subjectUri?: string;
    payload?: Record<string, unknown>;
    retentionUntil: string;
    occurredAt: string;
}

export interface AppendAuditEventResult {
    appended: boolean;
    auditEventId: string;
}

export class PostgresAuditRepository {
    constructor(private readonly pool: Pool) {}

    async append(
        input: AppendAuditEventInput,
    ): Promise<AppendAuditEventResult> {
        const result = await this.pool.query<{
            audit_event_id: string | number;
            inserted: boolean;
        }>(
            `INSERT INTO operational_audit_events (
                command_id, actor_did, action, subject_uri, payload,
                retention_until, occurred_at
             ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
             ON CONFLICT (command_id) DO UPDATE
             SET command_id = EXCLUDED.command_id
             RETURNING audit_event_id, (xmax = 0) AS inserted`,
            [
                input.commandId,
                input.actorDid ?? null,
                input.action,
                input.subjectUri ?? null,
                JSON.stringify(sanitizeAuditPayload(input.payload ?? {})),
                input.retentionUntil,
                input.occurredAt,
            ],
        );
        const row = result.rows[0];
        if (!row) {
            throw new Error('AUDIT_INSERT_FAILED');
        }
        return {
            appended: row.inserted,
            auditEventId: String(row.audit_event_id),
        };
    }
}
