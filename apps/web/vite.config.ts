import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@patchwork/shared/category-policy': fileURLToPath(
                new URL(
                    '../../packages/shared/src/category-policy.ts',
                    import.meta.url,
                ),
            ),
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
