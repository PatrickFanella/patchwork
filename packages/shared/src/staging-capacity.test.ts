import { describe, expect, it } from 'vitest';
import {
    evaluateStagingCapacityEvidence,
    type StagingCapacityEvidence,
} from './staging-capacity.js';

const passingEvidence = (): StagingCapacityEvidence => ({
    environment: 'nuc-home-staging',
    durationSeconds: 300,
    readWorkload: {
        totalRequests: 30_000,
        errorCount: 0,
        worstP95Ms: 45,
        minimumActualRps: 10,
    },
    lifecycleWorkload: {
        attempted: 3,
        completed: 3,
        maximumProjectionSeconds: 15.3,
        cleanupComplete: true,
    },
    moderationWorkload: {
        enqueued: 3,
        resolved: 3,
        maximumQueueAgeSeconds: 1.5,
        cleanupComplete: true,
    },
    resources: {
        maximumHostCpuRatio: 0.55,
        minimumHostMemoryHeadroomRatio: 0.48,
        minimumDiskHeadroomRatio: 0.39,
        maximumContainerMemoryRatio: 0.12,
        maximumDatabaseConnectionRatio: 0.18,
    },
    reliability: {
        serviceRestartDelta: 0,
        httpErrorDelta: 0,
        ingestionErrorDelta: 0,
        maximumEventSourceLagSeconds: 0.5,
        recoveredWithinSeconds: 12,
        allServicesReadyAfter: true,
    },
});

describe('evaluateStagingCapacityEvidence', () => {
    it('requires a sustained mixed workload rather than read-only evidence', () => {
        const evidence = passingEvidence();
        evidence.durationSeconds = 60;
        evidence.readWorkload.minimumActualRps = 9;
        evidence.lifecycleWorkload.completed = 0;
        evidence.lifecycleWorkload.maximumProjectionSeconds = 31;
        evidence.moderationWorkload.resolved = 0;

        const result = evaluateStagingCapacityEvidence(evidence);

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual(
            expect.arrayContaining([
                'workload duration must be at least 300 seconds',
                'every read route must sustain at least 10 requests per second',
                'at least 3 lifecycle journeys must complete',
                'lifecycle projection must complete within 30 seconds',
                'at least 3 moderation items must resolve',
            ]),
        );
    });

    it('passes complete evidence with safe headroom and clean recovery', () => {
        expect(evaluateStagingCapacityEvidence(passingEvidence())).toEqual({
            passed: true,
            failures: [],
        });
    });

    it('fails closed on errors, unsafe headroom, restart, or incomplete cleanup', () => {
        const evidence = passingEvidence();
        evidence.readWorkload.errorCount = 1;
        evidence.lifecycleWorkload.cleanupComplete = false;
        evidence.resources.maximumDatabaseConnectionRatio = 0.81;
        evidence.reliability.serviceRestartDelta = 1;
        evidence.reliability.allServicesReadyAfter = false;

        const result = evaluateStagingCapacityEvidence(evidence);

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual(
            expect.arrayContaining([
                'read workload must complete without errors',
                'lifecycle workload cleanup must complete',
                'database connection usage must remain at or below 70%',
                'service restart count must not increase',
                'all services must be ready after recovery',
            ]),
        );
    });
});
