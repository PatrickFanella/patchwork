import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

export const maintenanceReasonCodes = [
    'privacy',
    'authorization',
    'abuse',
    'integrity',
    'moderation-backlog',
    'monitoring',
    'backup',
] as const;

const declareSchema = z
    .object({
        reasonCodes: z
            .array(z.enum(maintenanceReasonCodes))
            .min(1)
            .max(7)
            .transform(values => [...new Set(values)]),
        publicMessage: z.string().trim().min(1).max(300),
    })
    .strict();

interface StateRow {
    active: boolean;
    reason_codes: string[];
    public_message: string;
    activated_at: Date | string | null;
    resumed_at: Date | string | null;
    version: string | number;
    updated_at: Date | string;
}

export interface MaintenanceState {
    active: boolean;
    reasonCodes: string[];
    publicMessage: string;
    activatedAt: string | null;
    resumedAt: string | null;
    version: number;
    updatedAt: string;
}

const render = (row: StateRow): MaintenanceState => ({
    active: row.active,
    reasonCodes: row.reason_codes,
    publicMessage: row.public_message,
    activatedAt:
        row.activated_at ? new Date(row.activated_at).toISOString() : null,
    resumedAt:
        row.resumed_at ? new Date(row.resumed_at).toISOString() : null,
    version: Number(row.version),
    updatedAt: new Date(row.updated_at).toISOString(),
});

const inTransaction = async <T>(
    pool: Pool,
    work: (client: PoolClient) => Promise<T>,
): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export class MaintenanceModeService {
    private current: MaintenanceState = {
        active: false,
        reasonCodes: [],
        publicMessage: 'Patchwork is operating normally.',
        activatedAt: null,
        resumedAt: null,
        version: 0,
        updatedAt: new Date(0).toISOString(),
    };

    constructor(
        private readonly pool: Pool,
        private readonly environmentOverride = false,
    ) {}

    async ensureReady(): Promise<void> {
        await this.refresh();
    }

    isActive(): boolean {
        return this.environmentOverride || this.current.active;
    }

    status(): MaintenanceState & { environmentOverride: boolean } {
        if (!this.environmentOverride) {
            return { ...this.current, environmentOverride: false };
        }
        return {
            ...this.current,
            active: true,
            reasonCodes: this.current.active ?
                this.current.reasonCodes
            :   ['integrity'],
            publicMessage:
                'Patchwork is temporarily read-only while operators verify service integrity.',
            environmentOverride: true,
        };
    }

    async refresh(): Promise<MaintenanceState> {
        const result = await this.pool.query<StateRow>(
            `SELECT active, reason_codes, public_message, activated_at,
                    resumed_at, version, updated_at
               FROM platform_maintenance_state
              WHERE state_id = TRUE`,
        );
        if (!result.rows[0]) throw new Error('MAINTENANCE_STATE_MISSING');
        this.current = render(result.rows[0]);
        return this.current;
    }

    async declare(
        actorDid: string,
        input: unknown,
        idempotencyKey: string,
        now = new Date(),
    ): Promise<MaintenanceState> {
        const command = declareSchema.parse(input);
        const state = await inTransaction(this.pool, async client => {
            const duplicate = await client.query<StateRow>(
                `SELECT s.active, s.reason_codes, s.public_message,
                        s.activated_at, s.resumed_at, s.version, s.updated_at
                   FROM platform_maintenance_audit a
                   JOIN platform_maintenance_state s ON s.state_id = TRUE
                  WHERE a.idempotency_key = $1`,
                [idempotencyKey],
            );
            if (duplicate.rows[0]) return render(duplicate.rows[0]);
            const previous = await client.query<StateRow>(
                `SELECT active, reason_codes, public_message, activated_at,
                        resumed_at, version, updated_at
                   FROM platform_maintenance_state
                  WHERE state_id = TRUE FOR UPDATE`,
            );
            const before = previous.rows[0]!;
            const updated = await client.query<StateRow>(
                `UPDATE platform_maintenance_state
                    SET active = TRUE, reason_codes = $1,
                        public_message = $2, activated_at = $3,
                        activated_by_did = $4, resumed_at = NULL,
                        resumed_by_did = NULL, version = version + 1,
                        updated_at = $3
                  WHERE state_id = TRUE
              RETURNING active, reason_codes, public_message, activated_at,
                        resumed_at, version, updated_at`,
                [
                    command.reasonCodes,
                    command.publicMessage,
                    now,
                    actorDid,
                ],
            );
            await client.query(
                `INSERT INTO platform_maintenance_audit (
                    idempotency_key, actor_did, action, reason_codes,
                    public_message, previous_active, next_active, occurred_at,
                    retention_until
                 ) VALUES ($1, $2, 'declare', $3, $4, $5, TRUE, $6, $7)`,
                [
                    idempotencyKey,
                    actorDid,
                    command.reasonCodes,
                    command.publicMessage,
                    before.active,
                    now,
                    new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000),
                ],
            );
            return render(updated.rows[0]!);
        });
        this.current = state;
        return state;
    }

    async resume(
        actorDid: string,
        idempotencyKey: string,
        now = new Date(),
    ): Promise<MaintenanceState> {
        if (this.environmentOverride) {
            throw new Error('MAINTENANCE_ENVIRONMENT_OVERRIDE_ACTIVE');
        }
        const state = await inTransaction(this.pool, async client => {
            const duplicate = await client.query<StateRow>(
                `SELECT s.active, s.reason_codes, s.public_message,
                        s.activated_at, s.resumed_at, s.version, s.updated_at
                   FROM platform_maintenance_audit a
                   JOIN platform_maintenance_state s ON s.state_id = TRUE
                  WHERE a.idempotency_key = $1`,
                [idempotencyKey],
            );
            if (duplicate.rows[0]) return render(duplicate.rows[0]);
            const previous = await client.query<StateRow>(
                `SELECT active, reason_codes, public_message, activated_at,
                        resumed_at, version, updated_at
                   FROM platform_maintenance_state
                  WHERE state_id = TRUE FOR UPDATE`,
            );
            const before = previous.rows[0]!;
            const updated = await client.query<StateRow>(
                `UPDATE platform_maintenance_state
                    SET active = FALSE, reason_codes = '{}'::text[],
                        public_message = 'Patchwork is operating normally.',
                        resumed_at = $1, resumed_by_did = $2,
                        version = version + 1, updated_at = $1
                  WHERE state_id = TRUE
              RETURNING active, reason_codes, public_message, activated_at,
                        resumed_at, version, updated_at`,
                [now, actorDid],
            );
            await client.query(
                `INSERT INTO platform_maintenance_audit (
                    idempotency_key, actor_did, action, reason_codes,
                    public_message, previous_active, next_active, occurred_at,
                    retention_until
                 ) VALUES (
                    $1, $2, 'resume', $3, 'Patchwork is operating normally.',
                    $4, FALSE, $5, $6
                 )`,
                [
                    idempotencyKey,
                    actorDid,
                    before.reason_codes,
                    before.active,
                    now,
                    new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000),
                ],
            );
            return render(updated.rows[0]!);
        });
        this.current = state;
        return state;
    }
}
