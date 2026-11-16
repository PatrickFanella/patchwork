import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AtAuthService } from '../auth/at-auth-service.js';
import type { NativeHandoffService } from '../auth/native-handoff.js';
import { PublicHttpError, writeJsonResponse, writePublicError } from './error-response.js';
import { readJsonBody } from './json-body.js';

export const nativeAuthPaths = ['/auth/native/start', '/auth/native/exchange'];
/** Native endpoints never consume browser credentials or issue browser cookies. */
export const createNativeAuthHandler = (auth: AtAuthService, handoff: NativeHandoffService) =>
    (request: IncomingMessage, response: ServerResponse, url: URL): boolean => {
        if (!nativeAuthPaths.includes(url.pathname)) return false;
        response.setHeader('cache-control', 'no-store');
        response.setHeader('referrer-policy', 'no-referrer');
        void (async () => {
            try {
                if (request.method !== 'POST') throw new PublicHttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
                if (request.headers.authorization || /(?:^|;\s*)patchwork_session=/.test(request.headers.cookie ?? '')) {
                    throw new PublicHttpError(401, 'CONFLICTING_AUTHENTICATION', 'Native sign-in requires a request without existing credentials.');
                }
                const body = await readJsonBody(request);
                const result = url.pathname.endsWith('/start')
                    ? await auth.beginNativeLogin(body)
                    : await handoff.exchange(body);
                writeJsonResponse(response, 200, result);
            } catch (error) { writePublicError(response, error); }
        })();
        return true;
    };
