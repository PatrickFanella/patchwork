import { readFile } from 'node:fs/promises';
import {
    evaluateStagingCapacityEvidence,
    type StagingCapacityEvidence,
} from '../packages/shared/src/staging-capacity.js';

const main = async (): Promise<void> => {
    const evidencePath = process.argv[2];
    if (!evidencePath) {
        throw new Error(
            'Usage: npm run capacity:staging:evaluate -- PATH_TO_EVIDENCE.json',
        );
    }

    const evidence = JSON.parse(
        await readFile(evidencePath, 'utf8'),
    ) as StagingCapacityEvidence;
    const evaluation = evaluateStagingCapacityEvidence(evidence);

    process.stdout.write(
        `${JSON.stringify(
            {
                evidenceKind: 'staging-capacity-evaluation',
                passed: evaluation.passed,
                failures: evaluation.failures,
            },
            null,
            2,
        )}\n`,
    );

    if (!evaluation.passed) process.exitCode = 1;
};

void main();
