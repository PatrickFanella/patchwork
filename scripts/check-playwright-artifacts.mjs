import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['apps/web/test-results', 'apps/web/playwright-report'];
const configuredTerms = (process.env.PATCHWORK_ARTIFACT_REDACTION_TERMS ?? '')
    .split(/[\n,]/)
    .map(value => value.trim())
    .filter(Boolean);
const terms = new Set(configuredTerms);
for (const name of [
    'PATCHWORK_E2E_EXACT_LATITUDE',
    'PATCHWORK_E2E_EXACT_LONGITUDE',
    'PATCHWORK_E2E_DISCOVERY_LATITUDE',
    'PATCHWORK_E2E_DISCOVERY_LONGITUDE',
    'PATCHWORK_E2E_PRIVATE_MARKER',
]) {
    if (process.env[name]) terms.add(process.env[name]);
}
for (const name of [
    'PATCHWORK_E2E_REQUESTER_STATE',
    'PATCHWORK_E2E_HELPER_STATE',
    'PATCHWORK_E2E_MAINTAINER_STATE',
]) {
    if (!process.env[name]) continue;
    try {
        const state = JSON.parse(readFileSync(process.env[name], 'utf8'));
        for (const cookie of state.cookies) {
            if (typeof cookie.value === 'string' && cookie.value) terms.add(cookie.value);
        }
    } catch {
        throw new Error(`Unable to read protected browser state from ${name}; refuse artifact upload.`);
    }
}
const files = [];
const collect = path => {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
        for (const entry of readdirSync(path)) collect(join(path, entry));
        return;
    }
    if (!path.endsWith('.last-run.json')) files.push(path);
};
for (const root of roots) collect(root);
if (files.length > 0 && configuredTerms.length === 0) {
    throw new Error('Playwright artifacts exist but PATCHWORK_ARTIFACT_REDACTION_TERMS is empty; refuse artifact upload.');
}
const contentFor = path => path.endsWith('.zip') ?
    execFileSync('unzip', ['-p', path], { maxBuffer: 128 * 1024 * 1024 }) :
    readFileSync(path);
const findings = [];
for (const path of files) {
    const content = contentFor(path).toString('utf8');
    for (const term of terms) {
        if (content.includes(term)) findings.push(`${relative('.', path)}: protected value matched`);
    }
}
if (findings.length > 0) {
    throw new Error(`Sensitive values found in Playwright artifacts:\n${findings.join('\n')}`);
}
console.log(`Playwright artifact redaction check passed (${files.length} files).`);
