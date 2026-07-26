import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env['PATCHWORK_E2E_BASE_URL'];
const localPort = Number(process.env['PATCHWORK_E2E_PORT'] ?? '41739');
if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65_535) {
    throw new Error('PATCHWORK_E2E_PORT must be an integer TCP port.');
}
// Keep the development origin on the same loopback hostname as the API
// default. Newer Chromium versions enforce private-network boundaries before
// Playwright can fulfill mismatched localhost/127.0.0.1 routes.
const localBaseUrl = `http://localhost:${localPort}`;

export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.spec.ts',
    fullyParallel: true,
    forbidOnly: !!process.env['CI'],
    retries: process.env['CI'] ? 2 : 0,
    workers: process.env['CI'] ? 1 : undefined,
    reporter: process.env['CI'] ? 'github' : 'list',
    use: {
        baseURL: externalBaseUrl ?? localBaseUrl,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer:
        externalBaseUrl ? undefined : {
            command: `npm run dev -- --host localhost --port ${localPort} --strictPort`,
            url: localBaseUrl,
            reuseExistingServer: false,
            timeout: 60_000,
        },
});
