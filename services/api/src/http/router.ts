export interface RouteDefinition<Handler> {
    method: string;
    pathname: string;
    handler: Handler;
}

export type RouteResolution<Handler> =
    | { kind: 'matched'; handler: Handler }
    | { kind: 'method-not-allowed'; allow: string[] }
    | { kind: 'not-found' };

export interface MethodRouter<Handler> {
    resolve(method: string | undefined, pathname: string): RouteResolution<Handler>;
}

export const createMethodRouter = <Handler>(
    definitions: readonly RouteDefinition<Handler>[],
): MethodRouter<Handler> => {
    const routes = new Map<string, Map<string, Handler>>();
    for (const definition of definitions) {
        const method = definition.method.toUpperCase();
        const methods = routes.get(definition.pathname) ?? new Map<string, Handler>();
        if (methods.has(method)) {
            throw new Error(`Duplicate route: ${method} ${definition.pathname}`);
        }
        methods.set(method, definition.handler);
        routes.set(definition.pathname, methods);
    }

    return {
        resolve(method, pathname) {
            const methods = routes.get(pathname);
            if (!methods) return { kind: 'not-found' };
            const handler = methods.get((method ?? 'GET').toUpperCase());
            if (handler) return { kind: 'matched', handler };
            return {
                kind: 'method-not-allowed',
                allow: [...methods.keys()].sort((left, right) =>
                    left.localeCompare(right),
                ),
            };
        },
    };
};
