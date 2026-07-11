import type { PlatformRole } from '@patchwork/shared';
import type { Pool } from 'pg';

export interface SetPlatformRoleCommand {
    did: string;
    role: Exclude<PlatformRole, 'anonymous'>;
    updatedBy: string;
    updatedAt: string;
}

export interface RoleRepository {
    resolve(did: string): Promise<Exclude<PlatformRole, 'anonymous'>>;
    set(command: SetPlatformRoleCommand): Promise<void>;
}

export class PostgresRoleRepository implements RoleRepository {
    constructor(private readonly pool: Pool) {}

    async resolve(
        did: string,
    ): Promise<Exclude<PlatformRole, 'anonymous'>> {
        const result = await this.pool.query<{
            role: Exclude<PlatformRole, 'anonymous'>;
        }>('SELECT role FROM platform_roles WHERE did = $1', [did]);
        return result.rows[0]?.role ?? 'user';
    }

    async set(command: SetPlatformRoleCommand): Promise<void> {
        await this.pool.query(
            `INSERT INTO platform_roles (did, role, updated_by, updated_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (did) DO UPDATE
             SET role = EXCLUDED.role,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = EXCLUDED.updated_at`,
            [command.did, command.role, command.updatedBy, command.updatedAt],
        );
    }
}
