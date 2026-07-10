import type { IncomingMessage, ServerResponse } from 'node:http';
import { AtClientError } from '@patchwork/at-client';
import type { PlatformRole } from '@patchwork/shared';
import { createAuthorizationContext } from '../authorization-guard.js';
import type { LifecycleService } from '../lifecycle-service.js';

const MAX_BODY_SIZE = 1024 * 1024;

export interface LifecycleSessionPrincipal {
    did: string;
    role: PlatformRole;
}

export interface LifecycleTransitionHandlerDependencies {
    service: LifecycleService;
    resolveSession(token: string): Promise<LifecycleSessionPrincipal>;
}

const readSessionCookie = (request: IncomingMessage): string | undefined => {
    for (const cookie of request.headers.cookie?.split(';') ?? []) {
        const [name, ...valueParts] = cookie.trim().split('=');
        if (name === 'patchwork_session') {
            return decodeURIComponent(valueParts.join('='));
        }
    }
    return undefined;
};

const readJsonBody = (request: IncomingMessage): Promise<unknown> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        request.on('data', (chunk: Buffer) => {
            totalSize += chunk.length;
            if (totalSize > MAX_BODY_SIZE) {
                reject(new Error('REQUEST_BODY_TOO_LARGE'));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new Error('INVALID_JSON'));
            }
        });
        request.on('error', reject);
    });

const writeJson = (
    response: ServerResponse,
    statusCode: number,
    body: unknown,
): void => {
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
};

export const createLifecycleTransitionHandler = (
    dependencies: LifecycleTransitionHandlerDependencies,
) => {
    return (
        request: IncomingMessage,
        response: ServerResponse,
        requestUrl: URL,
    ): boolean => {
        if (
            request.method !== 'POST' ||
            requestUrl.pathname !== '/aid/post/transition'
        ) {
            return false;
        }

        void (async () => {
            try {
                const sessionToken = readSessionCookie(request);
                if (!sessionToken) {
                    throw new AtClientError(
                        'SESSION_EXPIRED',
                        'The Patchwork browser session is missing.',
                    );
                }
                const principal = await dependencies.resolveSession(sessionToken);
                const result = await dependencies.service.transitionFromBody(
                    await readJsonBody(request),
                    createAuthorizationContext(principal.did, principal.role),
                );
                writeJson(response, result.statusCode, result.body);
            } catch (error) {
                if (error instanceof AtClientError) {
                    writeJson(response, error.code === 'SESSION_EXPIRED' ? 401 : 403, {
                        error: { code: error.code, message: error.message },
                    });
                    return;
                }
                const code = error instanceof Error ? error.message : 'UNKNOWN';
                if (code === 'INVALID_JSON' || code === 'REQUEST_BODY_TOO_LARGE') {
                    writeJson(response, code === 'INVALID_JSON' ? 400 : 413, {
                        error: { code, message: 'Lifecycle request body is invalid.' },
                    });
                    return;
                }
                writeJson(response, 500, {
                    error: {
                        code: 'LIFECYCLE_TRANSITION_FAILED',
                        message: 'Lifecycle transition failed.',
                    },
                });
            }
        })();
        return true;
    };
};
