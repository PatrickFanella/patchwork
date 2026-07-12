import { describe, expect, it } from 'vitest';
import { RetentionMetrics } from './retention-metrics.js';

describe('retention metrics', () => {
    it('preserves the last success timestamp after a later failed attempt', () => {
        const metrics = new RetentionMetrics();
        metrics.recordSuccess(new Date('2026-07-11T00:00:00Z'));
        metrics.recordFailure(new Date('2026-07-11T01:00:00Z'));

        const output = metrics.renderPrometheus();
        expect(output).toContain('patchwork_retention_last_attempt_success');
        expect(output).toContain('} 0');
        expect(output).toContain(
            'patchwork_retention_last_success_timestamp_seconds',
        );
        expect(output).toContain('1783728000');
    });
});
