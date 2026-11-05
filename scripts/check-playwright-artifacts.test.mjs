import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./check-playwright-artifacts.mjs', import.meta.url));
const sensitiveNames = [
    'EXACT_LATITUDE', 'EXACT_LONGITUDE', 'DISCOVERY_LATITUDE',
    'DISCOVERY_LONGITUDE', 'PRIVATE_MARKER', 'REQUESTER_STATE',
    'HELPER_STATE', 'MAINTAINER_STATE',
].map(name => `PATCHWORK_E2E_${name}`);

function check(content, configure = () => {}) {
    const scratch = mkdtempSync(join(tmpdir(), 'patchwork-artifact-guard-'));
    try {
        const artifacts = join(scratch, 'apps/web/test-results');
        mkdirSync(artifacts, { recursive: true });
        writeFileSync(join(artifacts, 'output.txt'), content);
        const env = { ...process.env, PATCHWORK_ARTIFACT_REDACTION_TERMS: 'configured-protected-fixture' };
        for (const name of sensitiveNames) delete env[name];
        configure(env, scratch);
        const result = spawnSync(process.execPath, [script], { cwd: scratch, env, encoding: 'utf8' });
        return { status: result.status, output: result.stdout + result.stderr };
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

for (const name of sensitiveNames.slice(0, 5)) {
    test(`rejects the active ${name} without logging its value`, () => {
        const value = 'active-protected-fixture';
        const result = check(value, env => { env[name] = value; });
        assert.equal(result.status, 1);
        assert.match(result.output, /protected value matched/);
        assert.ok(!result.output.includes(value));
    });
}

for (const name of sensitiveNames.slice(5)) {
    test(`rejects cookies from ${name} without logging them`, () => {
        const value = 'active-cookie-fixture';
        const result = check(value, (env, scratch) => {
            env[name] = join(scratch, 'state.json');
            writeFileSync(env[name], JSON.stringify({ cookies: [{ name: 'patchwork_session', value }], origins: [] }));
        });
        assert.equal(result.status, 1);
        assert.match(result.output, /protected value matched/);
        assert.ok(!result.output.includes(value));
    });
}

test('still requires configured terms when active fixture values are available', () => {
    const result = check('safe output', env => {
        delete env.PATCHWORK_ARTIFACT_REDACTION_TERMS;
        env.PATCHWORK_E2E_EXACT_LATITUDE = 'active-protected-fixture';
    });
    assert.equal(result.status, 1);
    assert.match(result.output, /REDACTION_TERMS is empty/);
});

test('retains configured-term rejection without printing the matched term', () => {
    const result = check('configured-protected-fixture');
    assert.equal(result.status, 1);
    assert.ok(!result.output.includes('configured-protected-fixture'));
});

test('accepts artifacts without protected values', () => {
    assert.equal(check('safe output').status, 0);
});

test('refuses unreadable browser state without exposing its contents', () => {
    const result = check('safe output', (env, scratch) => {
        env.PATCHWORK_E2E_REQUESTER_STATE = join(scratch, 'state.json');
        writeFileSync(env.PATCHWORK_E2E_REQUESTER_STATE, 'malformed-private-state-fixture');
    });
    assert.equal(result.status, 1);
    assert.match(result.output, /Unable to read protected browser state/);
    assert.ok(!result.output.includes('malformed-private-state-fixture'));
});
