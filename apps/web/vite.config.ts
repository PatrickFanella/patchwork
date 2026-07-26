import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { resolveWebDataMode } from './src/features/data-mode';

export default defineConfig(({ command, mode }) => {
    resolveWebDataMode(loadEnv(mode, process.cwd(), ''), { command, mode });
    return {
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
            proxy: {
                '/api': {
                    target: 'http://localhost:4000',
                    changeOrigin: false,
                    rewrite: path => path.replace(/^\/api/, ''),
                },
            },
        },
        test: {
            exclude: ['e2e/**', 'node_modules/**'],
        },
    };
});
