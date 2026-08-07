import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ledgerPath = resolve(root, 'docs/test-traceability-protected-pilot.json');
const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));

if (ledger.sprint !== 'protected-pilot-readiness' || ledger.stories.length !== 8) {
    throw new Error('Protected-pilot ledger must contain the eight accepted sprint stories.');
}

const storyIds = new Set();
const criterionIds = new Set();
for (const story of ledger.stories) {
    if (!/^PPR-[1-8]$/.test(story.id) || storyIds.has(story.id)) {
        throw new Error(`Invalid or duplicate story id: ${story.id}`);
    }
    storyIds.add(story.id);
    for (const field of ['actor', 'need', 'outcome', 'privacyBoundary', 'rollback']) {
        if (typeof story[field] !== 'string' || story[field].trim().length < 12) {
            throw new Error(`${story.id} is missing a thorough ${field}.`);
        }
    }
    if (story.criteria.length < 5 || story.tests.length < 3) {
        throw new Error(`${story.id} needs at least five criteria and three test references.`);
    }
    const kinds = new Set(story.tests.map((test) => test.kind));
    if (!kinds.has('automated') || !kinds.has('operational')) {
        throw new Error(`${story.id} must include automated and operational evidence.`);
    }
    for (const criterion of story.criteria) {
        if (!criterion.id.startsWith(`${story.id}-AC`) || criterionIds.has(criterion.id)) {
            throw new Error(`Invalid or duplicate criterion: ${criterion.id}`);
        }
        criterionIds.add(criterion.id);
        if (!['automated', 'operational', 'external'].includes(criterion.evidence)) {
            throw new Error(`Invalid evidence class for ${criterion.id}.`);
        }
    }
    for (const test of story.tests) {
        if (!Array.isArray(test.covers) || test.covers.length === 0) {
            throw new Error(`${story.id} has an untraceable test.`);
        }
        await access(resolve(root, test.path));
        for (const criterion of test.covers) {
            if (!story.criteria.some((candidate) => candidate.id === criterion)) {
                throw new Error(`${test.path} points outside ${story.id}: ${criterion}`);
            }
        }
    }
}

for (const story of ledger.stories) {
    const covered = new Set(story.tests.flatMap((test) => test.covers));
    for (const criterion of story.criteria) {
        if (criterion.evidence !== 'external' && !covered.has(criterion.id)) {
            throw new Error(`${criterion.id} has no test or operational evidence reference.`);
        }
    }
}

console.log(`Protected-pilot traceability: ${storyIds.size} stories and ${criterionIds.size} criteria verified.`);
