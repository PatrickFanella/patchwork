import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                mh: {
                    bg: 'var(--mh-bg)',
                    surface: 'var(--mh-surface)',
                    surfaceElev: 'var(--mh-surface-elev)',
                    panel: 'var(--mh-panel)',
                    text: 'var(--mh-text)',
                    textMuted: 'var(--mh-text-muted)',
                    textSoft: 'var(--mh-text-soft)',
                    accent: 'var(--mh-accent)',
                    accent2: 'var(--mh-accent-2)',
                    accent3: 'var(--mh-accent-3)',
                    cta: 'var(--mh-cta)',
                    success: 'var(--mh-success)',
                    danger: 'var(--mh-danger)',
                    link: 'var(--mh-link)',
                    border: 'var(--mh-border)',
                    borderSubtle: 'var(--mh-border-subtle)',
                    borderSoft: 'var(--mh-border-soft)',
                },
            },
            fontFamily: {
                mhHeading: ['Inter Tight', 'Space Grotesk', 'sans-serif'],
                body: ['Inter', 'Public Sans', 'sans-serif'],
                mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
                serifAccent: ['Fraunces', 'serif'],
            },
            boxShadow: {
                mh: 'var(--mh-shadow-hard)',
                mhHover: 'var(--mh-shadow-hard-hover)',
            },
        },
    },
};

export default config;
