import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('staging recovery and alerting contract', () => {
    it('publishes only validated, checksummed backups and a Prometheus result', () => {
        const script = read('scripts/backup-postgres.sh');

        expect(script).toContain('set -Eeuo pipefail');
        expect(script).toContain('umask 077');
        expect(script).toContain('mktemp');
        expect(script).toContain('pg_restore --list');
        expect(script).toContain('sha256');
        expect(script).toContain('PATCHWORK_BACKUP_METRICS_FILE');
        expect(script).toContain('patchwork_backup_last_attempt_success');
        expect(script).toContain('patchwork_backup_last_success_timestamp_seconds');
    });

    it('restores only into an empty target and invalidates restored sessions', () => {
        const script = read('scripts/restore-postgres.sh');

        expect(script).toContain('set -Eeuo pipefail');
        expect(script).toContain('REQUIRE_EMPTY_DATABASE');
        expect(script).toContain('patchwork_browser_sessions');
        expect(script).toContain('at_oauth_sessions');
        expect(script).toContain('at_oauth_state');
        expect(script).toContain('RESTORE_VERIFICATION_SQL');
        expect(script).toContain('recovery_point_seconds');
    });

    it('defines executable alerts for every Phase 7 failure mode', () => {
        const rules = read('monitoring/prometheus/patchwork-alerts.yml');
        const api = read('services/api/src/index.ts');
        const moderation = read('services/moderation-worker/src/metrics.ts');

        for (const alert of [
            'PatchworkApiErrorRateHigh',
            'PatchworkIndexerDisconnected',
            'PatchworkIndexerLagHigh',
            'PatchworkModerationQueueOldestItemHigh',
            'PatchworkDatabaseUnavailable',
            'PatchworkBackupFailed',
            'PatchworkBackupStale',
        ]) {
            expect(rules).toContain(`alert: ${alert}`);
        }
        expect(rules).toContain('runbook_url:');
        expect(rules).toContain('environment="staging"');
        expect(api).toContain('sliCollector.recordRequest');
        expect(api).toContain('sliCollector.recordError');
        expect(moderation).toContain('moderation_queue_oldest_item_age_seconds');
    });
});
