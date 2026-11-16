import type { ServerResponse } from 'node:http';
import { oauthCallbackLandingPath, serializeSessionCookie, type AtAuthService } from '../auth/at-auth-service.js';
import { createCsrfToken, serializeCsrfCookie } from './csrf.js';

/** Shared by the real provider callback and the executable native integration caller. */
export const completeOAuthResponse = async (
    service: AtAuthService, params: URLSearchParams, response: ServerResponse,
    publicOrigin: string, secure: boolean,
): Promise<void> => {
    const result = await service.completeLogin(params);
    if ('nativeRedirect' in result) {
        response.writeHead(302, { location: result.nativeRedirect,
            'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    } else {
        response.writeHead(302, {
            location: new URL(oauthCallbackLandingPath(result.returnTo), publicOrigin).toString(),
            'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
            'set-cookie': [serializeSessionCookie(result.sessionToken, secure),
                serializeCsrfCookie(createCsrfToken(), secure)],
        });
    }
    response.end();
};
