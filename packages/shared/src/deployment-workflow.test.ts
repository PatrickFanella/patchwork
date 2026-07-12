import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('immutable staging deployment contract', () => {
    it('builds, scans, signs, and publishes all runtime images exactly once', () => {
        const workflow = read('.github/workflows/deploy-staging.yml');
        expect(workflow).toContain('ghcr.io/${{ github.repository_owner }}');
        for (const target of [
            'api-runtime',
            'indexer-runtime',
            'moderation-runtime',
            'web-runtime',
        ]) {
            expect(workflow).toContain(`target: ${target}`);
        }
        expect(workflow).toContain('aquasecurity/trivy-action');
        expect(workflow).toContain('cosign sign --yes');
        expect(workflow).toContain('docker push');
        expect(workflow).toContain('artifact-digests.json');
    });

    it('deploys only digests, runs real gates, and can restore the previous manifest', () => {
        const workflow = read('.github/workflows/deploy-staging.yml');
        const deploy = read('scripts/deploy-staging-digests.sh');
        const rollback = read('scripts/rollback-staging-digests.sh');
        expect(workflow).toContain('environment: staging');
        expect(workflow).toContain('deploy-staging-digests.sh');
        expect(workflow).toContain('at-record-lifecycle.spec.ts');
        expect(deploy).toContain('@sha256:');
        expect(deploy).toContain('--no-build');
        expect(deploy).toContain('/health/ready');
        expect(deploy).toContain('previous-artifact-digests.json');
        expect(rollback).toContain('previous-artifact-digests.json');
        expect(rollback).toContain('--no-build');
    });

    it('contains no echo-only deployment or progressive-delivery success claims', () => {
        const ci = read('.github/workflows/ci.yml');
        expect(ci).not.toContain('PASS: All images built with immutable tags');
        expect(ci).not.toContain('Checkpoint: health-probe ......... PASS');
        expect(ci).not.toContain('Result: All checkpoints passed');
    });

    it('refuses mutable tags before invoking the deployment runtime', () => {
        const directory = mkdtempSync(resolve(tmpdir(), 'patchwork-deploy-'));
        const manifest = resolve(directory, 'manifest.json');
        const envFile = resolve(directory, 'staging.env');
        const composeFile = resolve(directory, 'compose.yml');
        writeFileSync(
            manifest,
            JSON.stringify({
                gitSha: 'abc',
                images: {
                    api: 'ghcr.io/example/api:latest',
                    indexer: 'ghcr.io/example/indexer:latest',
                    moderation: 'ghcr.io/example/moderation:latest',
                    web: 'ghcr.io/example/web:latest',
                },
            }),
        );
        writeFileSync(envFile, 'IGNORED=test\n');
        writeFileSync(composeFile, 'services: {}\n');

        const result = spawnSync(
            'bash',
            [
                resolve(root, 'scripts/deploy-staging-digests.sh'),
                manifest,
                envFile,
                composeFile,
            ],
            { encoding: 'utf8', env: { ...process.env, PATCHWORK_RELEASE_STATE_DIR: directory } },
        );

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Refusing non-digest image for api.');
    });
});
