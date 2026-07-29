import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Root coverage runs from the repository root, where Vite otherwise
        // loads the operator-facing .env and makes unit tests call/assert the
        // deployed API origin. Coverage must exercise the same relative,
        // same-origin contract as workspace unit tests.
        env: {
            VITE_API_BASE_URL: '/api',
        },
        // PostgreSQL suites share migration tables in TEST_DATABASE_URL. Running
        // files concurrently can deadlock their migration and TRUNCATE setup,
        // making the coverage gate nondeterministic.
        fileParallelism: false,
        include: [
            'apps/**/*.{test,spec}.{ts,tsx}',
            'services/**/*.{test,spec}.{ts,tsx}',
            'packages/**/*.{test,spec}.{ts,tsx}',
        ],
        exclude: ['**/node_modules/**', 'apps/web/e2e/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary', 'lcov'],
            reportsDirectory: 'coverage',
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/coverage/**',
                '**/*.{test,spec}.{ts,tsx,js,jsx}',
                '**/e2e/**',
                '**/fixtures/**',
                '**/*-fixtures.ts',
                '**/migrations/**',
                '**/*.config.{ts,js}',
            ],
        },
    },
});
