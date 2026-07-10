import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@patchwork/at-lexicons': fileURLToPath(
                new URL(
                    '../../packages/at-lexicons/src/validators.ts',
                    import.meta.url,
                ),
            ),
        },
    },
    server: {
        port: 5173,
    },
    test: {
        exclude: ['e2e/**', 'node_modules/**'],
    },
});
