import assert from 'node:assert/strict';
import test from 'node:test';
import { restrictedStorageState, validateAccounts } from './bootstrap-staging-sessions.mjs';

const now = new Date('2026-11-05T12:00:00Z');
const fixtureAccounts = () => Object.fromEntries(['requester', 'helper', 'maintainer'].map((role, index) => [role, {
    handle: `${role}.example.test`, password: 'disposable-fixture-password',
    did: `did:plc:${String.fromCharCode(97 + index).repeat(24)}`,
    purpose: 'Patchwork deployment browser tests', review_by: '2026-12-23',
}]));

test('only approved, distinct, in-date disposable identities may be used', () => {
    assert.doesNotThrow(() => validateAccounts(fixtureAccounts(), now));
    for (const change of [
        accounts => { accounts.requester.purpose = 'Personal account'; },
        accounts => { accounts.helper.review_by = '2026-11-04'; },
        accounts => { accounts.maintainer.did = accounts.requester.did; },
        accounts => { delete accounts.requester.password; },
        accounts => { accounts.helper.did = 'did:example:fake'; },
        accounts => { delete accounts.maintainer; },
    ]) {
        const accounts = fixtureAccounts();
        change(accounts);
        assert.throws(() => validateAccounts(accounts, now), error => {
            assert.doesNotMatch(error.message, /disposable-fixture-password|did:plc:|example\.test/);
            return true;
        });
    }
});

test('export excludes provider credentials, local storage and unrelated cookies', () => {
    const cookie = (name, domain = 'patchwork.subcult.tv', secure = true) => ({ name, domain, secure, value: 'fixture' });
    const state = restrictedStorageState({ cookies: [
        cookie('patchwork_session'), cookie('patchwork_csrf'), cookie('provider_session', 'pds.subcult.tv'),
        cookie('patchwork_session', 'attacker.test'), cookie('unrelated'),
    ], origins: [{ origin: 'https://pds.subcult.tv', localStorage: [{ name: 'token', value: 'fixture' }] }] }, 'https://patchwork.subcult.tv');
    assert.deepEqual(state.cookies.map(item => item.name), ['patchwork_session', 'patchwork_csrf']);
    assert.deepEqual(state.origins, []);
});

test('missing or insecure session credentials fail rather than export partial state', () => {
    for (const cookies of [[], [{ name: 'patchwork_session', domain: 'patchwork.subcult.tv', secure: true }], [
        { name: 'patchwork_session', domain: 'patchwork.subcult.tv', secure: false },
        { name: 'patchwork_csrf', domain: 'patchwork.subcult.tv', secure: true },
    ]]) {
        assert.throws(() => restrictedStorageState({ cookies }, 'https://patchwork.subcult.tv'));
    }
});
