const labels = (): string =>
    `{project="patchwork",service="api",component="stitch",environment="${process.env.PATCHWORK_ENV ?? 'development'}"}`;

export class RetentionMetrics {
    private lastAttemptSuccess = 1;
    private lastAttemptTimestampSeconds = 0;
    private lastSuccessTimestampSeconds = 0;

    recordSuccess(at = new Date()): void {
        const timestamp = Math.floor(at.getTime() / 1_000);
        this.lastAttemptSuccess = 1;
        this.lastAttemptTimestampSeconds = timestamp;
        this.lastSuccessTimestampSeconds = timestamp;
    }

    recordFailure(at = new Date()): void {
        this.lastAttemptSuccess = 0;
        this.lastAttemptTimestampSeconds = Math.floor(at.getTime() / 1_000);
    }

    renderPrometheus(): string {
        return [
            '# TYPE patchwork_retention_last_attempt_success gauge',
            `patchwork_retention_last_attempt_success${labels()} ${this.lastAttemptSuccess}`,
            '# TYPE patchwork_retention_last_attempt_timestamp_seconds gauge',
            `patchwork_retention_last_attempt_timestamp_seconds${labels()} ${this.lastAttemptTimestampSeconds}`,
            '# TYPE patchwork_retention_last_success_timestamp_seconds gauge',
            `patchwork_retention_last_success_timestamp_seconds${labels()} ${this.lastSuccessTimestampSeconds}`,
        ].join('\n');
    }
}
