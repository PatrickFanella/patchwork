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
    /** Bounded route/outcome counters for actionable HTTP alerts. */
    routeOutcomes: Map<string, number>;
}

const boundedRoute = (endpoint: string): string => {
    const pathname = endpoint.split('?')[0] ?? '/';
    if (pathname.length > 160) return '/__overflow__';
    return pathname
        .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ':id')
        .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:id')
        .replace(/\/attachments\/(content|uploads)\/[^/]+/g, '/attachments/$1/:id');
};

const outcomeForStatus = (statusCode: number): string =>
    Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599 ?
        `${Math.floor(statusCode / 100)}xx`
    :   'unknown';

export class SliCollector {
    private _requestTotal = 0;
    private _errorTotal = 0;
    private _durationTotalSeconds = 0;
    private readonly _endpointCounts = new Map<string, number>();
    private readonly _endpointErrors = new Map<string, number>();
    private readonly _routeOutcomes = new Map<string, number>();

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

    recordHttpRequest(endpoint: string, statusCode: number, durationMs: number): void {
        const route = boundedRoute(endpoint);
        this.recordRequest(route, durationMs);
        if (statusCode >= 500) this.recordError(route);
        this.recordHttpOutcome(route, statusCode);
    }

    /** Record a bounded route/outcome label after a response has finished. */
    recordHttpOutcome(endpoint: string, statusCode: number): void {
        const route = boundedRoute(endpoint);
        const key = `${route}\u0000${outcomeForStatus(statusCode)}`;
        this._routeOutcomes.set(key, (this._routeOutcomes.get(key) ?? 0) + 1);
    }

    snapshot(): SliSnapshot {
        return {
            requestTotal: this._requestTotal,
            errorTotal: this._errorTotal,
            durationTotalSeconds: this._durationTotalSeconds,
            endpointCounts: new Map(this._endpointCounts),
            endpointErrors: new Map(this._endpointErrors),
            routeOutcomes: new Map(this._routeOutcomes),
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
            '# HELP patchwork_http_route_request_total Total HTTP requests by bounded route and outcome.',
            '# TYPE patchwork_http_route_request_total counter',
        );
        for (const [key, count] of this._routeOutcomes) {
            const [endpoint, outcome] = key.split('\u0000');
            lines.push(
                `patchwork_http_route_request_total${formatLabels({ service, endpoint }).slice(0, -1)},outcome="${outcome}"} ${count}`,
            );
            if (outcome === '5xx') {
                lines.push(
                    `patchwork_http_route_error_total${formatLabels({ service, endpoint })} ${count}`,
                );
            }
        }

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

    /**
     * Render transport-only HTTP metrics for a service whose primary SLI
     * family already uses patchwork_sli_* for domain work such as ingestion or
     * moderation. Keeping the families distinct prevents duplicate Prometheus
     * series from hiding either workload.
     */
    renderHttpPrometheus(service: PatchworkService): string {
        const labels = formatLabels({ service });
        const heapUsed = process.memoryUsage().heapUsed;
        const heapTotal = process.memoryUsage().heapTotal;
        const saturation =
            heapTotal > 0 ?
                parseFloat((heapUsed / heapTotal).toFixed(4))
            :   0;

        return [
            '# HELP patchwork_http_request_total Total HTTP requests processed.',
            '# TYPE patchwork_http_request_total counter',
            `patchwork_http_request_total${labels} ${this._requestTotal}`,
            '# HELP patchwork_http_error_total Total HTTP request errors.',
            '# TYPE patchwork_http_error_total counter',
            `patchwork_http_error_total${labels} ${this._errorTotal}`,
            '# HELP patchwork_http_request_duration_seconds Cumulative HTTP request duration in seconds.',
            '# TYPE patchwork_http_request_duration_seconds counter',
            `patchwork_http_request_duration_seconds${labels} ${parseFloat(this._durationTotalSeconds.toFixed(6))}`,
            '# HELP patchwork_http_heap_saturation_ratio HTTP process heap memory saturation (0-1).',
            '# TYPE patchwork_http_heap_saturation_ratio gauge',
            `patchwork_http_heap_saturation_ratio${labels} ${saturation}`,
        ].join('\n');
    }

    reset(): void {
        this._requestTotal = 0;
        this._errorTotal = 0;
        this._durationTotalSeconds = 0;
        this._endpointCounts.clear();
        this._endpointErrors.clear();
        this._routeOutcomes.clear();
    }
}
