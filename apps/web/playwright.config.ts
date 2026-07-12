import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env['PATCHWORK_E2E_BASE_URL'];

export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.spec.ts',
    fullyParallel: true,
    forbidOnly: !!process.env['CI'],
    retries: process.env['CI'] ? 2 : 0,
    workers: process.env['CI'] ? 1 : undefined,
    reporter: process.env['CI'] ? 'github' : 'list',
    use: {
        baseURL: externalBaseUrl ?? 'http://localhost:5173',
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
            command: 'npm run dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env['CI'],
            timeout: 60_000,
        },
});
