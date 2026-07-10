import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
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
