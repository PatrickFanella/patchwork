/**
 * Standard SLI (Service Level Indicator) definitions for all Patchwork services.
 *
 * Provides consistent metric naming, labels, and Prometheus rendering helpers
 * so all three services (api, indexer, moderation-worker) emit comparable SLI data.
 */

// ---------------------------------------------------------------------------
// Metric names
// ---------------------------------------------------------------------------

export const SLI_METRIC_NAMES = [
    'request_duration_seconds',
    'request_total',
    'error_total',
    'saturation_ratio',
] as const;

export type SliMetricName = (typeof SLI_METRIC_NAMES)[number];

// ---------------------------------------------------------------------------
// Label types
// ---------------------------------------------------------------------------

export type PatchworkService = 'api' | 'indexer' | 'moderation-worker';
export type PatchworkComponent = 'stitch' | 'spool' | 'thimble';

export const SERVICE_COMPONENT_MAP: Record<
    PatchworkService,
    PatchworkComponent
> = {
    api: 'stitch',
    indexer: 'spool',
    'moderation-worker': 'thimble',
};

export interface SliLabels {
    project?: string;
    service: PatchworkService;
    component?: PatchworkComponent;
    environment?: string;
    endpoint?: string;
}

// ---------------------------------------------------------------------------
// Prometheus helpers
// ---------------------------------------------------------------------------

/**
 * Default environment label.
 * Reads from PATCHWORK_ENV at startup; defaults to "development".
 */
const DEFAULT_ENVIRONMENT =
    (typeof process !== 'undefined' &&
        process.env?.['PATCHWORK_ENV']) ||
    'development';

const formatLabels = (labels: SliLabels): string => {
    const project = labels.project ?? 'patchwork';
    const component =
        labels.component ?? SERVICE_COMPONENT_MAP[labels.service];
    const environment = labels.environment ?? DEFAULT_ENVIRONMENT;
    const parts = [
        `project="${project}"`,
        `service="${labels.service}"`,
        `component="${component}"`,
        `environment="${environment}"`,
    ];
    if (labels.endpoint) {
        parts.push(`endpoint="${labels.endpoint}"`);
    }
    return `{${parts.join(',')}}`;
};

/**
 * Render a single Prometheus gauge/counter line for an SLI metric.
 */
export const createSliGauge = (
    service: PatchworkService,
    metric: SliMetricName,
    value: number,
    extra?: { endpoint?: string },
): string => {
    const labels = formatLabels({
        service,
        endpoint: extra?.endpoint,
    });
    return `patchwork_sli_${metric}${labels} ${value}`;
};

// ---------------------------------------------------------------------------
// SLI Collector — lightweight request tracking
// ---------------------------------------------------------------------------

export interface SliSnapshot {
    requestTotal: number;
    errorTotal: number;
    /** Cumulative request duration in seconds. */
    durationTotalSeconds: number;
    /** Per-endpoint counters (route -> count). */
    endpointCounts: Map<string, number>;
    /** Per-endpoint error counters (route -> count). */
    endpointErrors: Map<string, number>;
}

export class SliCollector {
    private _requestTotal = 0;
    private _errorTotal = 0;
    private _durationTotalSeconds = 0;
    private readonly _endpointCounts = new Map<string, number>();
    private readonly _endpointErrors = new Map<string, number>();

    recordRequest(endpoint: string, durationMs: number): void {
        this._requestTotal++;
        this._durationTotalSeconds += durationMs / 1000;
        this._endpointCounts.set(
            endpoint,
            (this._endpointCounts.get(endpoint) ?? 0) + 1,
        );
    }

    recordError(endpoint: string): void {
        this._errorTotal++;
        this._endpointErrors.set(
            endpoint,
            (this._endpointErrors.get(endpoint) ?? 0) + 1,
        );
    }

    snapshot(): SliSnapshot {
        return {
            requestTotal: this._requestTotal,
            errorTotal: this._errorTotal,
            durationTotalSeconds: this._durationTotalSeconds,
            endpointCounts: new Map(this._endpointCounts),
            endpointErrors: new Map(this._endpointErrors),
        };
    }

    /**
     * Render SLI metrics in Prometheus exposition format.
     */
    renderPrometheus(service: PatchworkService): string {
        const lines: string[] = [];

        lines.push(
            '# HELP patchwork_sli_request_total Total requests processed.',
            '# TYPE patchwork_sli_request_total counter',
            createSliGauge(service, 'request_total', this._requestTotal),
        );

        lines.push(
            '# HELP patchwork_sli_error_total Total errors.',
            '# TYPE patchwork_sli_error_total counter',
            createSliGauge(service, 'error_total', this._errorTotal),
        );

        lines.push(
            '# HELP patchwork_sli_request_duration_seconds Cumulative request duration in seconds.',
            '# TYPE patchwork_sli_request_duration_seconds counter',
            createSliGauge(
                service,
                'request_duration_seconds',
                parseFloat(this._durationTotalSeconds.toFixed(6)),
            ),
        );

        const heapUsed = process.memoryUsage().heapUsed;
        const heapTotal = process.memoryUsage().heapTotal;
        const saturation =
            heapTotal > 0 ?
                parseFloat((heapUsed / heapTotal).toFixed(4))
            :   0;

        lines.push(
            '# HELP patchwork_sli_saturation_ratio Heap memory saturation (0-1).',
            '# TYPE patchwork_sli_saturation_ratio gauge',
            createSliGauge(service, 'saturation_ratio', saturation),
        );

        return lines.join('\n');
    }

    reset(): void {
        this._requestTotal = 0;
        this._errorTotal = 0;
        this._durationTotalSeconds = 0;
        this._endpointCounts.clear();
        this._endpointErrors.clear();
    }
}
