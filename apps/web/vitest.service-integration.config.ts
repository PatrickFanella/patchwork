import { defineConfig } from 'vitest/config';

/**
 * Vitest config for direct service integration tests.
 *
 * This includes only the lifecycle suite kept outside the web unit suite.
 */
export default defineConfig({
    test: {
        include: ['e2e/**/*.integration.test.ts'],
        exclude: ['node_modules/**'],
    },
});
