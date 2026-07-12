export type WebDataMode = 'api' | 'fixture';

export interface WebBuildContext {
    command: 'build' | 'serve';
    mode: string;
}

export const resolveWebDataMode = (
    env: Record<string, string | boolean | undefined>,
    context: WebBuildContext,
): WebDataMode => {
    const configured = env.VITE_DATA_MODE ?? 'api';
    if (configured !== 'api' && configured !== 'fixture') {
        throw new Error('VITE_DATA_MODE must be either api or fixture.');
    }
    if (
        configured === 'fixture' &&
        context.command === 'build' &&
        context.mode !== 'development'
    ) {
        throw new Error(
            'VITE_DATA_MODE=fixture is forbidden in production builds.',
        );
    }
    return configured;
};
