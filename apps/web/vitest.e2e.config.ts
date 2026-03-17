import { defineConfig } from 'vitest/config';

/**
 * Wave 3 (#99) — Vitest config for E2E contract-path integration tests.
 *
 * This config includes the e2e/ directory (excluded from the default vite
 * test config) so vitest can run the lifecycle integration tests.
 */
export default defineConfig({
    test: {
        include: ['e2e/**/*.test.ts'],
        exclude: ['node_modules/**'],
    },
});
