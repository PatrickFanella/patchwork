/**
 * Alerting policy types and standard alert rules.
 *
 * Alert events are emitted as structured JSON log lines so they can be
 * ingested by any log-based alerting pipeline (Grafana Loki, Datadog,
 * CloudWatch Logs Insights, etc.) without additional infrastructure.
 */

/* ------------------------------------------------------------------ */
/*  Core types                                                        */
/* ------------------------------------------------------------------ */

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AlertRule {
    /** Unique machine-readable name, e.g. `"error_rate_high"`. */
    name: string;
    /** Human-readable description of the trigger condition. */
    condition: string;
    /** How urgently this needs to be addressed. */
    severity: AlertSeverity;
    /** Link to the runbook for this alert. */
    runbookUrl: string;
}

export interface AlertEvent {
    /** The rule that fired. */
    rule: AlertRule;
    /** ISO-8601 timestamp of when the event was generated. */
    timestamp: string;
    /** Service that produced the event. */
    service: string;
    /** Arbitrary detail bag for debugging context. */
    details: Record<string, unknown>;
    /** Whether this event resolves (clears) a previously-firing alert. */
    resolved: boolean;
}

/* ------------------------------------------------------------------ */
/*  Standard alert rules                                              */
/* ------------------------------------------------------------------ */

const RUNBOOK_BASE = 'https://docs.patchwork.community/runbooks';

export const ALERT_RULES: Readonly<Record<string, AlertRule>> = {
    error_rate_high: {
        name: 'error_rate_high',
        condition: 'HTTP 5xx error rate exceeds 5% over a 5-minute window',
        severity: 'critical',
        runbookUrl: `${RUNBOOK_BASE}/error-rate-high`,
    },
    latency_p95_high: {
        name: 'latency_p95_high',
        condition: 'p95 response latency exceeds 2 seconds over a 5-minute window',
        severity: 'warning',
        runbookUrl: `${RUNBOOK_BASE}/latency-p95-high`,
    },
    queue_depth_high: {
        name: 'queue_depth_high',
        condition: 'Moderation queue depth exceeds 100 pending items',
        severity: 'warning',
        runbookUrl: `${RUNBOOK_BASE}/queue-depth-high`,
    },
    checkpoint_stale: {
        name: 'checkpoint_stale',
        condition: 'Indexer checkpoint has not advanced in more than 5 minutes',
        severity: 'critical',
        runbookUrl: `${RUNBOOK_BASE}/checkpoint-stale`,
    },
    disk_usage_high: {
        name: 'disk_usage_high',
        condition: 'Disk usage exceeds 80% on the data volume',
        severity: 'warning',
        runbookUrl: `${RUNBOOK_BASE}/disk-usage-high`,
    },
    service_down: {
        name: 'service_down',
        condition: 'Health check endpoint is failing for a service',
        severity: 'critical',
        runbookUrl: `${RUNBOOK_BASE}/service-down`,
    },
};

/* ------------------------------------------------------------------ */
/*  Structured log formatting                                         */
/* ------------------------------------------------------------------ */

export interface FormattedAlertLog {
    level: 'alert';
    alert_name: string;
    severity: AlertSeverity;
    condition: string;
    runbook_url: string;
    service: string;
    resolved: boolean;
    timestamp: string;
    details: Record<string, unknown>;
}

/**
 * Format an `AlertEvent` into a flat JSON-serialisable object suitable
 * for structured log output.
 */
export const formatAlertLog = (event: AlertEvent): FormattedAlertLog => ({
    level: 'alert',
    alert_name: event.rule.name,
    severity: event.rule.severity,
    condition: event.rule.condition,
    runbook_url: event.rule.runbookUrl,
    service: event.service,
    resolved: event.resolved,
    timestamp: event.timestamp,
    details: event.details,
});
