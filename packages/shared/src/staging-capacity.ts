export interface StagingCapacityEvidence {
    environment: string;
    durationSeconds: number;
    readWorkload: {
        totalRequests: number;
        errorCount: number;
        worstP95Ms: number;
        minimumActualRps: number;
        allModeledBudgetsPassed: boolean;
    };
    lifecycleWorkload: {
        attempted: number;
        completed: number;
        maximumProjectionSeconds: number;
        cleanupComplete: boolean;
    };
    moderationWorkload: {
        enqueued: number;
        resolved: number;
        maximumQueueAgeSeconds: number;
        cleanupComplete: boolean;
    };
    resources: {
        maximumHostCpuRatio: number;
        minimumHostMemoryHeadroomRatio: number;
        minimumDiskHeadroomRatio: number;
        maximumContainerMemoryRatio: number;
        maximumDatabaseConnectionRatio: number;
    };
    reliability: {
        serviceRestartDelta: number;
        httpErrorDelta: number;
        ingestionErrorDelta: number;
        maximumEventSourceLagSeconds: number;
        recoveredWithinSeconds: number;
        allServicesReadyAfter: boolean;
    };
}

export interface StagingCapacityEvaluation {
    passed: boolean;
    failures: string[];
}

const finite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const atLeast = (
    failures: string[],
    value: unknown,
    minimum: number,
    failure: string,
): void => {
    if (!finite(value) || value < minimum) failures.push(failure);
};

const atMost = (
    failures: string[],
    value: unknown,
    maximum: number,
    failure: string,
): void => {
    if (!finite(value) || value > maximum) failures.push(failure);
};

/**
 * Evaluate a deliberately conservative home-staging capacity proof.
 *
 * The gate is not a production sizing claim. It only accepts sustained,
 * mixed-path evidence with cleanup, bounded resource use, no observed errors,
 * and a ready post-workload system.
 */
export const evaluateStagingCapacityEvidence = (
    evidence: StagingCapacityEvidence,
): StagingCapacityEvaluation => {
    const failures: string[] = [];

    if (evidence.environment !== 'nuc-home-staging') {
        failures.push('environment must be nuc-home-staging');
    }
    atLeast(
        failures,
        evidence.durationSeconds,
        300,
        'workload duration must be at least 300 seconds',
    );

    atLeast(
        failures,
        evidence.readWorkload?.totalRequests,
        1_000,
        'read workload must complete at least 1000 requests',
    );
    if (evidence.readWorkload?.errorCount !== 0) {
        failures.push('read workload must complete without errors');
    }
    atMost(
        failures,
        evidence.readWorkload?.worstP95Ms,
        500,
        'read workload p95 must remain at or below 500ms',
    );
    atLeast(
        failures,
        evidence.readWorkload?.minimumActualRps,
        20,
        'every read route must sustain at least 20 requests per second',
    );
    if (evidence.readWorkload?.allModeledBudgetsPassed !== true) {
        failures.push('every modeled read budget must pass');
    }

    atLeast(
        failures,
        evidence.lifecycleWorkload?.completed,
        3,
        'at least 3 lifecycle journeys must complete',
    );
    if (
        !finite(evidence.lifecycleWorkload?.attempted) ||
        evidence.lifecycleWorkload.attempted !==
            evidence.lifecycleWorkload.completed
    ) {
        failures.push('every attempted lifecycle journey must complete');
    }
    atMost(
        failures,
        evidence.lifecycleWorkload?.maximumProjectionSeconds,
        10,
        'lifecycle projection must complete within 10 seconds',
    );
    if (evidence.lifecycleWorkload?.cleanupComplete !== true) {
        failures.push('lifecycle workload cleanup must complete');
    }

    atLeast(
        failures,
        evidence.moderationWorkload?.resolved,
        3,
        'at least 3 moderation items must resolve',
    );
    if (
        !finite(evidence.moderationWorkload?.enqueued) ||
        evidence.moderationWorkload.enqueued !==
            evidence.moderationWorkload.resolved
    ) {
        failures.push('every enqueued moderation item must resolve');
    }
    atMost(
        failures,
        evidence.moderationWorkload?.maximumQueueAgeSeconds,
        30,
        'moderation queue age must remain at or below 30 seconds',
    );
    if (evidence.moderationWorkload?.cleanupComplete !== true) {
        failures.push('moderation workload cleanup must complete');
    }

    atMost(
        failures,
        evidence.resources?.maximumHostCpuRatio,
        0.8,
        'host CPU usage must remain at or below 80%',
    );
    atLeast(
        failures,
        evidence.resources?.minimumHostMemoryHeadroomRatio,
        0.2,
        'host memory headroom must remain at or above 20%',
    );
    atLeast(
        failures,
        evidence.resources?.minimumDiskHeadroomRatio,
        0.15,
        'disk headroom must remain at or above 15%',
    );
    atMost(
        failures,
        evidence.resources?.maximumContainerMemoryRatio,
        0.7,
        'container memory usage must remain at or below 70%',
    );
    atMost(
        failures,
        evidence.resources?.maximumDatabaseConnectionRatio,
        0.7,
        'database connection usage must remain at or below 70%',
    );

    if (evidence.reliability?.serviceRestartDelta !== 0) {
        failures.push('service restart count must not increase');
    }
    if (evidence.reliability?.httpErrorDelta !== 0) {
        failures.push('HTTP error count must not increase');
    }
    if (evidence.reliability?.ingestionErrorDelta !== 0) {
        failures.push('ingestion error count must not increase');
    }
    atMost(
        failures,
        evidence.reliability?.maximumEventSourceLagSeconds,
        5,
        'event-source lag must remain at or below 5 seconds',
    );
    atMost(
        failures,
        evidence.reliability?.recoveredWithinSeconds,
        60,
        'post-workload recovery must complete within 60 seconds',
    );
    if (evidence.reliability?.allServicesReadyAfter !== true) {
        failures.push('all services must be ready after recovery');
    }

    return { passed: failures.length === 0, failures };
};
