import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { CURRENT_POLICY_VERSION, requiredPolicyDocuments } from '../packages/shared/src/account-onboarding.ts';

const roles = ['requester', 'helper', 'maintainer'];
const pdsOrigin = 'https://pds.subcult.tv';

export function validateAccounts(accounts, now = new Date()) {
    const identities = new Set();
    for (const role of roles) {
        const account = accounts?.[role];
        if (!account || !['handle', 'password', 'did'].every(key => typeof account[key] === 'string' && account[key].length > 0)
            || account.purpose !== 'Patchwork deployment browser tests'
            || !/^did:plc:[a-z2-7]{24}$/.test(account.did)
            || !/^\d{4}-\d{2}-\d{2}$/.test(account.review_by ?? '')
            || account.review_by < now.toISOString().slice(0, 10)
            || identities.has(account.did)) {
            throw new Error(`Invalid, expired, or non-disposable ${role} account configuration.`);
        }
        identities.add(account.did);
    }
    return accounts;
}

export function restrictedStorageState(state, origin) {
    const hostname = new URL(origin).hostname;
    const cookies = state.cookies.filter(cookie => cookie.domain.replace(/^\./, '') === hostname
        && ['patchwork_session', 'patchwork_csrf'].includes(cookie.name));
    if (!['patchwork_session', 'patchwork_csrf'].every(name => cookies.some(cookie => cookie.name === name && cookie.secure))) {
        throw new Error('Missing secure Patchwork session or CSRF cookie.');
    }
    return { cookies, origins: [] };
}

async function bootstrap(accountsPath, outputDirectory) {
    process.umask(0o077);
    const origin = new URL(process.env.PATCHWORK_E2E_BASE_URL ?? '').origin;
    if (origin !== 'https://patchwork.subcult.tv') throw new Error('Unexpected staging origin.');
    const accounts = validateAccounts(JSON.parse(readFileSync(accountsPath, 'utf8')));
    mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
    const browser = await chromium.launch({
        ...(process.env.PATCHWORK_E2E_CHROMIUM_EXECUTABLE
            ? { executablePath: process.env.PATCHWORK_E2E_CHROMIUM_EXECUTABLE } : {}),
    });
    let stage = 'start';
    try {
        for (const role of roles) {
            stage = `${role}: provider sign-in`;
            const account = accounts[role];
            const context = await browser.newContext();
            try {
                const page = await context.newPage();
                await page.goto(`${pdsOrigin}/account`, { waitUntil: 'domcontentloaded' });
                const signedIn = await page.evaluate(async ({ identifier, password }) => {
                    const csrf = document.cookie.split(';').map(value => value.trim())
                        .find(value => value.startsWith('csrf-token='))?.slice('csrf-token='.length);
                    const response = await fetch('/@atproto/oauth-provider/~api/sign-in', {
                        method: 'POST', credentials: 'include', mode: 'same-origin',
                        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}) },
                        // The provider requires its remembered session for the OAuth redirect.
                        // This isolated context is closed and provider cookies are never exported.
                        body: JSON.stringify({ identifier, password, remember: true, locale: 'en' }),
                    });
                    return response.status;
                }, { identifier: account.handle, password: account.password });
                if (signedIn !== 200) throw new Error('Provider sign-in failed.');

                stage = `${role}: OAuth initiation`;
                const login = await context.request.post(`${origin}/api/oauth/login`, {
                    headers: { Accept: 'application/json', Origin: origin },
                    data: { handle: account.handle, returnTo: '/' },
                });
                if (login.status() !== 200) {
                    stage = `${role}: OAuth initiation (HTTP ${login.status()})`;
                    throw new Error('OAuth initiation failed.');
                }
                const authorizationUrl = new URL((await login.json()).authorizationUrl);
                if (authorizationUrl.origin !== pdsOrigin || authorizationUrl.pathname !== '/oauth/authorize') {
                    throw new Error('Unexpected authorization provider.');
                }
                stage = `${role}: provider authorization page`;
                await page.goto(authorizationUrl.href, { waitUntil: 'domcontentloaded' });
                await page.getByRole('button', { name: 'Authorize', exact: true }).click();
                stage = `${role}: OAuth callback`;
                await page.waitForURL(url => url.origin === origin);
                stage = `${role}: session identity and role verification`;
                const response = await context.request.get(`${origin}/api/auth/session`);
                const session = (await response.json()).session;
                if (response.status() !== 200 || session?.did !== account.did
                    || (role === 'maintainer' && !['admin', 'super_admin'].includes(session.role))) {
                    throw new Error('Session identity or maintainer role was not verified.');
                }

                stage = `${role}: current test-account consent`;
                const onboarding = await context.request.get(`${origin}/api/account/onboarding`);
                const policy = await onboarding.json();
                if (onboarding.status() !== 200 || policy.policyVersion !== CURRENT_POLICY_VERSION) {
                    throw new Error('Unexpected policy version.');
                }
                if (policy.consentRequired) {
                    const csrf = (await context.cookies(origin)).find(cookie => cookie.name === 'patchwork_csrf')?.value;
                    const consent = await context.request.post(`${origin}/api/account/consent`, {
                        headers: { Origin: origin, 'x-csrf-token': decodeURIComponent(csrf ?? ''), 'idempotency-key': crypto.randomUUID() },
                        data: { policyVersion: CURRENT_POLICY_VERSION, asserted18OrOlder: true, acceptedDocuments: [...requiredPolicyDocuments] },
                    });
                    if (consent.status() !== 200) throw new Error('Test-account consent failed.');
                }

                stage = `${role}: protected state export`;
                const state = restrictedStorageState(await context.storageState(), origin);
                writeFileSync(join(outputDirectory, `${role}-state.json`), JSON.stringify(state), { mode: 0o600, flag: 'wx' });
                if (process.env.GITHUB_ENV) {
                    const encoded = Buffer.from(JSON.stringify(state)).toString('base64');
                    for (const cookie of state.cookies) console.log(`::add-mask::${cookie.value}`);
                    console.log(`::add-mask::${encoded}`);
                    appendFileSync(process.env.GITHUB_ENV, `STAGING_E2E_${role.toUpperCase()}_STATE_B64=${encoded}\n`);
                }
                console.log(`Verified fresh ${role} OAuth session and current test-account consent.`);
            } finally {
                await context.close();
            }
        }
    } catch {
        // Browser/HTTP exceptions can contain OAuth query strings or credentials.
        throw new Error(`Staging session bootstrap failed at ${stage}. Private diagnostics withheld.`);
    } finally {
        await browser.close();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [, , accountsPath, outputDirectory] = process.argv;
    if (!accountsPath || !outputDirectory) {
        console.error('Usage: node --import tsx scripts/bootstrap-staging-sessions.mjs ACCOUNTS_JSON OUTPUT_DIRECTORY');
        process.exitCode = 1;
    } else {
        await bootstrap(accountsPath, outputDirectory).catch(error => {
            console.error(error.message.startsWith('Staging session bootstrap failed at ')
                ? error.message : 'Staging session bootstrap failed before authentication. Check protected configuration and browser prerequisites.');
            process.exitCode = 1;
        });
    }
}
