const DID_PATTERN = /did:[a-z0-9]+:[a-z0-9._:%-]+/gi;
const AT_URI_PATTERN = /at:\/\/[^\s"'`]+/gi;

const SENSITIVE_KEYS = new Set([
    'did',
    'authorDid',
    'reporterDid',
    'recipientDid',
    'subjectUri',
    'uri',
    'latitude',
    'longitude',
    'location',
]);

export const PUBLIC_MIN_PRECISION_KM = 1;

export const MODERATION_LOG_RETENTION_DAYS = 7;

export const enforceMinimumGeoPrecisionKm = (
    precisionKm: number,
    minimum = PUBLIC_MIN_PRECISION_KM,
): number => {
    if (!Number.isFinite(precisionKm)) {
        return minimum;
    }

    return Math.max(minimum, precisionKm);
};

export const redactSensitiveText = (value: string): string => {
    return value
        .replace(DID_PATTERN, 'did:[redacted]')
        .replace(AT_URI_PATTERN, 'at://[redacted]');
};

export const toRedactedUriReference = (uri: string): string => {
    if (!uri.startsWith('at://')) {
        return redactSensitiveText(uri);
    }

    const parts = uri.split('/');
    if (parts.length < 5) {
        return 'at://[redacted]';
    }

    const collection = parts[3] ?? '[collection]';
    return `at://[did]/${collection}/[record]`;
};

const redactByKey = (key: string, value: unknown): unknown => {
    if (value === null || value === undefined) {
        return value;
    }

    if (!SENSITIVE_KEYS.has(key)) {
        return value;
    }

    if (typeof value === 'string') {
        if (key === 'uri' || key === 'subjectUri') {
            return toRedactedUriReference(value);
        }

        if (key.toLowerCase().includes('did')) {
            return 'did:[redacted]';
        }

        return redactSensitiveText(value);
    }

    if (typeof value === 'number') {
        if (key === 'latitude' || key === 'longitude') {
            return Number(value.toFixed(2));
        }

        return value;
    }

    if (typeof value === 'object') {
        return '[redacted-object]';
    }

    return '[redacted]';
};

export const redactLogData = (value: unknown): unknown => {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string') {
        return redactSensitiveText(value);
    }

    if (Array.isArray(value)) {
        return value.map(entry => redactLogData(entry));
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        const redacted: Record<string, unknown> = {};

        for (const [key, entryValue] of entries) {
            if (SENSITIVE_KEYS.has(key)) {
                redacted[key] = redactByKey(key, entryValue);
                continue;
            }

            redacted[key] = redactLogData(entryValue);
        }

        return redacted;
    }

    return value;
};
