import { describe, expect, it } from 'vitest';
import { isConsentExemptPath } from './account-onboarding-service.js';

describe('policy consent routing', () => {
    it.each([
        '/auth/session',
        '/auth/refresh',
        '/account/onboarding',
        '/account/consent',
        '/account/preferences',
        '/account/export',
        '/account/deactivate',
    ])('allows %s before current policy consent', pathname => {
        expect(isConsentExemptPath(pathname)).toBe(true);
    });

    it.each(['/query/feed', '/aid-posts', '/moderation/queue'])(
        'continues to protect %s with current policy consent',
        pathname => {
            expect(isConsentExemptPath(pathname)).toBe(false);
        },
    );
});
