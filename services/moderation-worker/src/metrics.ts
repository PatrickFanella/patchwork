import type { ModerationPolicyAction } from '@patchwork/shared';

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
 * Build the standard Prometheus label set for the moderation worker.
 * Includes project, service, component, and environment labels to
 * support dashboard filtering and multi-environment aggregation.
 */
const buildServiceLabels = (extra?: Record<string, string>): string => {
    const parts: string[] = [
        'project="patchwork"',
        'service="moderation-worker"',
        'component="thimble"',
        `environment="${ENVIRONMENT}"`,
    ];
    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            parts.push(`${key}="${value}"`);
        }
    }
    return parts.join(',');
};

const SERVICE_LABELS = buildServiceLabels();

/**
 * Simple Prometheus-compatible metrics collector for moderation operations.
 * Exports log-based metric counters and gauges.
 */
export class ModerationMetrics {
    private queueDepth = 0;
    private readonly latencySamples: number[] = [];
    private readonly actionCounters = new Map<string, number>();
    private errorCount = 0;
    private readonly enqueueTimestamps = new Map<string, number>();

    /** Record when a queue item is enqueued (for latency tracking). */
    recordEnqueue(subjectUri: string): void {
        this.enqueueTimestamps.set(subjectUri, Date.now());
        this.queueDepth++;
    }

    /** Record when a queue item is dequeued/processed (for latency tracking). */
    recordDequeue(subjectUri: string): void {
        const enqueuedAt = this.enqueueTimestamps.get(subjectUri);
        if (enqueuedAt !== undefined) {
            const latencyMs = Date.now() - enqueuedAt;
            this.latencySamples.push(latencyMs / 1000);
            this.enqueueTimestamps.delete(subjectUri);
        }
        if (this.queueDepth > 0) {
            this.queueDepth--;
        }
    }

    /** Set the current queue depth (e.g., from store count). */
    setQueueDepth(depth: number): void {
        this.queueDepth = depth;
    }

    /** Record a policy action being applied. */
    recordAction(action: ModerationPolicyAction): void {
        const current = this.actionCounters.get(action) ?? 0;
        this.actionCounters.set(action, current + 1);
    }

    /** Record an error. */
    recordError(): void {
        this.errorCount++;
    }

    /** Get the current queue depth. */
    getQueueDepth(): number {
        return this.queueDepth;
    }

    /** Get the action count for a specific action type. */
    getActionCount(action: ModerationPolicyAction): number {
        return this.actionCounters.get(action) ?? 0;
    }

    /** Get the total error count. */
    getErrorCount(): number {
        return this.errorCount;
    }

    /** Get the average latency in seconds. */
    getAverageLatencySeconds(): number {
        if (this.latencySamples.length === 0) {
            return 0;
        }
        const sum = this.latencySamples.reduce(
            (accumulator, value) => accumulator + value,
            0,
        );
        return sum / this.latencySamples.length;
    }

    /** Get the total number of actions processed. */
    getTotalActions(): number {
        let total = 0;
        for (const count of this.actionCounters.values()) {
            total += count;
        }
        return total;
    }

    /** Render Prometheus-format text output. */
    renderPrometheus(): string {
        const lines: string[] = [];

        lines.push(
            '# HELP moderation_queue_depth Current number of items in the moderation queue.',
        );
        lines.push('# TYPE moderation_queue_depth gauge');
        lines.push(
            `moderation_queue_depth{${SERVICE_LABELS}} ${this.queueDepth}`,
        );

        lines.push(
            '# HELP moderation_queue_latency_seconds Time from enqueue to dequeue in seconds.',
        );
        lines.push('# TYPE moderation_queue_latency_seconds gauge');
        const avgLatency = this.getAverageLatencySeconds();
        lines.push(
            `moderation_queue_latency_seconds{${SERVICE_LABELS}} ${avgLatency.toFixed(6)}`,
        );

        lines.push(
            '# HELP moderation_actions_total Total moderation actions by type.',
        );
        lines.push('# TYPE moderation_actions_total counter');
        for (const [action, count] of this.actionCounters.entries()) {
            lines.push(
                `moderation_actions_total{${SERVICE_LABELS},action="${action}"} ${count}`,
            );
        }
        if (this.actionCounters.size === 0) {
            lines.push(
                `moderation_actions_total{${SERVICE_LABELS},action="none"} 0`,
            );
        }

        lines.push(
            '# HELP moderation_errors_total Total moderation processing errors.',
        );
        lines.push('# TYPE moderation_errors_total counter');
        lines.push(
            `moderation_errors_total{${SERVICE_LABELS}} ${this.errorCount}`,
        );

        // SLI-aligned metrics for cross-service consistency
        lines.push(
            '# HELP patchwork_sli_request_total Total moderation actions (SLI-aligned).',
            '# TYPE patchwork_sli_request_total counter',
            `patchwork_sli_request_total{${SERVICE_LABELS}} ${this.getTotalActions()}`,
        );

        lines.push(
            '# HELP patchwork_sli_error_total Total moderation errors (SLI-aligned).',
            '# TYPE patchwork_sli_error_total counter',
            `patchwork_sli_error_total{${SERVICE_LABELS}} ${this.errorCount}`,
        );

        lines.push(
            '# HELP patchwork_sli_saturation_ratio Queue depth saturation (SLI-aligned).',
            '# TYPE patchwork_sli_saturation_ratio gauge',
            `patchwork_sli_saturation_ratio{${SERVICE_LABELS}} ${Math.min(this.queueDepth / 1000, 1)}`,
        );

        return lines.join('\n');
    }

    /** Reset all metrics (useful for tests). */
    reset(): void {
        this.queueDepth = 0;
        this.latencySamples.length = 0;
        this.actionCounters.clear();
        this.errorCount = 0;
        this.enqueueTimestamps.clear();
    }
}

// ---------------------------------------------------------------------------
// Performance tracking histogram for load testing / capacity validation
// ---------------------------------------------------------------------------

/**
 * Tracks per-action processing latency for capacity planning.
 * Collects samples and computes percentile summaries on demand.
 */
export class ModerationPerformanceHistogram {
    private readonly _samples: number[] = [];
    private readonly _maxSamples: number;

    constructor(maxSamples = 10_000) {
        this._maxSamples = maxSamples;
    }

    /** Record a latency sample in milliseconds. */
    record(latencyMs: number): void {
        if (this._samples.length >= this._maxSamples) {
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
