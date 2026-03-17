import type { CheckpointHealth } from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Dashboard-ready label configuration
// ---------------------------------------------------------------------------

/**
 * Runtime environment label applied to all metrics.
 * Reads from PATCHWORK_ENV at startup; defaults to "development".
 */
const ENVIRONMENT =
    (typeof process !== 'undefined' &&
        process.env?.['PATCHWORK_ENV']) ||
    'development';

/**
 * Build the standard Prometheus label set for the indexer service.
 * Includes project, service, component, and environment labels to
 * support dashboard filtering and multi-environment aggregation.
 */
const buildLabels = (extra?: Record<string, string>): string => {
    const parts: string[] = [
        'project="patchwork"',
        'service="indexer"',
        'component="spool"',
        `environment="${ENVIRONMENT}"`,
    ];
    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            parts.push(`${key}="${value}"`);
        }
    }
    return `{${parts.join(',')}}`;
};

/** Default label set (no extras). */
const PROMETHEUS_LABELS = buildLabels();

// ---------------------------------------------------------------------------
// Metric interfaces
// ---------------------------------------------------------------------------

/**
 * Ingestion runtime metrics for the indexer pipeline.
 * Tracks checkpoint health, event processing counts, and errors.
 */
export interface IngestionRuntimeMetrics {
    /** Seconds since the last checkpoint was saved. */
    checkpointLagSeconds: number | null;
    /** The sequence number of the most recent checkpoint write. */
    checkpointSequence: number | null;
    /** The firehose cursor stored in the last checkpoint. */
    checkpointCursor: number | null;
    /** Whether the checkpoint store is healthy. */
    checkpointHealthy: boolean;
    /** Total number of firehose events successfully processed. */
    ingestEventsTotal: number;
    /** Total number of processing errors. */
    ingestErrorsTotal: number;
    /** Process uptime in seconds. */
    uptimeSeconds: number;
}

// ---------------------------------------------------------------------------
// Performance tracking histogram for load testing / capacity validation
// ---------------------------------------------------------------------------

/**
 * Tracks per-event processing latency for capacity planning.
 * Collects samples and computes percentile summaries on demand.
 */
export class PerformanceHistogram {
    private readonly _samples: number[] = [];
    private readonly _maxSamples: number;

    constructor(maxSamples = 10_000) {
        this._maxSamples = maxSamples;
    }

    /** Record a latency sample in milliseconds. */
    record(latencyMs: number): void {
        if (this._samples.length >= this._maxSamples) {
            // Circular overwrite to bound memory
            this._samples[this._samples.length % this._maxSamples] = latencyMs;
        } else {
            this._samples.push(latencyMs);
        }
    }

    /** Compute a percentile (0-100) from collected samples. */
    percentile(p: number): number {
        if (this._samples.length === 0) return 0;
        const sorted = [...this._samples].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)]!;
    }

    /** Get the number of recorded samples. */
    get count(): number {
        return this._samples.length;
    }

    /** Reset all samples. */
    reset(): void {
        this._samples.length = 0;
    }
}

// ---------------------------------------------------------------------------
// Metrics collector
// ---------------------------------------------------------------------------

/**
 * Mutable counters that the pipeline updates during ingestion.
 */
export class MetricsCollector {
    private _ingestEventsTotal = 0;
    private _ingestErrorsTotal = 0;

    recordEvents(count: number): void {
        this._ingestEventsTotal += count;
    }

    recordErrors(count: number): void {
        this._ingestErrorsTotal += count;
    }

    get ingestEventsTotal(): number {
        return this._ingestEventsTotal;
    }

    get ingestErrorsTotal(): number {
        return this._ingestErrorsTotal;
    }

    reset(): void {
        this._ingestEventsTotal = 0;
        this._ingestErrorsTotal = 0;
    }

    /**
     * Build a full metrics snapshot incorporating checkpoint health.
     */
    snapshot(checkpointHealth: CheckpointHealth): IngestionRuntimeMetrics {
        return {
            checkpointLagSeconds: checkpointHealth.lagSeconds,
            checkpointSequence:
                checkpointHealth.lastCheckpoint?.sequence ?? null,
            checkpointCursor:
                checkpointHealth.lastCheckpoint?.cursor ?? null,
            checkpointHealthy: checkpointHealth.healthy,
            ingestEventsTotal: this._ingestEventsTotal,
            ingestErrorsTotal: this._ingestErrorsTotal,
            uptimeSeconds: Math.floor(process.uptime()),
        };
    }
}

// ---------------------------------------------------------------------------
// Prometheus rendering
// ---------------------------------------------------------------------------

/**
 * Render ingestion runtime metrics in Prometheus exposition format.
 *
 * All metrics include the standard dashboard-ready labels:
 *   project, service, component, environment
 */
export const renderPrometheusRuntimeMetrics = (
    metrics: IngestionRuntimeMetrics,
): string => {
    const lines: string[] = [];

    lines.push(
        '# HELP patchwork_service_up Service health status (1 = up).',
        '# TYPE patchwork_service_up gauge',
        `patchwork_service_up${PROMETHEUS_LABELS} 1`,
    );

    lines.push(
        '# HELP patchwork_process_uptime_seconds Process uptime in seconds.',
        '# TYPE patchwork_process_uptime_seconds counter',
        `patchwork_process_uptime_seconds${PROMETHEUS_LABELS} ${metrics.uptimeSeconds}`,
    );

    lines.push(
        '# HELP patchwork_checkpoint_lag_seconds Seconds since last checkpoint save.',
        '# TYPE patchwork_checkpoint_lag_seconds gauge',
        `patchwork_checkpoint_lag_seconds${PROMETHEUS_LABELS} ${metrics.checkpointLagSeconds ?? -1}`,
    );

    lines.push(
        '# HELP patchwork_checkpoint_sequence Monotonic sequence of checkpoint writes.',
        '# TYPE patchwork_checkpoint_sequence counter',
        `patchwork_checkpoint_sequence${PROMETHEUS_LABELS} ${metrics.checkpointSequence ?? 0}`,
    );

    lines.push(
        '# HELP patchwork_checkpoint_cursor Last saved firehose cursor position.',
        '# TYPE patchwork_checkpoint_cursor gauge',
        `patchwork_checkpoint_cursor${PROMETHEUS_LABELS} ${metrics.checkpointCursor ?? -1}`,
    );

    lines.push(
        '# HELP patchwork_checkpoint_healthy Whether the checkpoint store is operational.',
        '# TYPE patchwork_checkpoint_healthy gauge',
        `patchwork_checkpoint_healthy${PROMETHEUS_LABELS} ${metrics.checkpointHealthy ? 1 : 0}`,
    );

    lines.push(
        '# HELP patchwork_ingest_events_total Total firehose events processed.',
        '# TYPE patchwork_ingest_events_total counter',
        `patchwork_ingest_events_total${PROMETHEUS_LABELS} ${metrics.ingestEventsTotal}`,
    );

    lines.push(
        '# HELP patchwork_ingest_errors_total Total ingestion errors.',
        '# TYPE patchwork_ingest_errors_total counter',
        `patchwork_ingest_errors_total${PROMETHEUS_LABELS} ${metrics.ingestErrorsTotal}`,
    );

    // SLI-aligned metrics for cross-service consistency
    lines.push(
        '# HELP patchwork_sli_request_total Total ingestion events (SLI-aligned).',
        '# TYPE patchwork_sli_request_total counter',
        `patchwork_sli_request_total${PROMETHEUS_LABELS} ${metrics.ingestEventsTotal}`,
    );

    lines.push(
        '# HELP patchwork_sli_error_total Total ingestion errors (SLI-aligned).',
        '# TYPE patchwork_sli_error_total counter',
        `patchwork_sli_error_total${PROMETHEUS_LABELS} ${metrics.ingestErrorsTotal}`,
    );

    return lines.join('\n');
};
