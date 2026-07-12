export const securityHeaders = (
    nodeEnv: string,
): Readonly<Record<string, string>> => ({
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cross-origin-resource-policy': 'same-site',
    ...(nodeEnv === 'production' ?
        { 'strict-transport-security': 'max-age=31536000; includeSubDomains' }
    :   {}),
});
