import { describe, expect, it } from 'vitest';
import {
    MODERATION_LOG_RETENTION_DAYS,
    enforceMinimumGeoPrecisionKm,
    redactLogData,
    redactSensitiveText,
    toRedactedUriReference,
} from './privacy.js';

describe('phase 7 geoprivacy + log redaction utilities', () => {
    it('enforces minimum geoprivacy precision', () => {
        expect(enforceMinimumGeoPrecisionKm(0.1)).toBe(1);
        expect(enforceMinimumGeoPrecisionKm(3)).toBe(3);
    });

    it('redacts sensitive identifiers in free text', () => {
        const redacted = redactSensitiveText(
            'sender did:example:alice reported at://did:example:alice/app.patchwork.aid.post/post-1',
        );

        expect(redacted).not.toContain('did:example:alice');
        expect(redacted).not.toContain('at://did:example:alice');
        expect(redacted).toContain('did:[redacted]');
        expect(redacted).toContain('at://[redacted]');
    });

    it('redacts structured log payload fields recursively', () => {
        const payload = {
            uri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
            authorDid: 'did:example:alice',
            location: {
                latitude: 40.712345,
                longitude: -74.005678,
            },
            nested: {
                reporterDid: 'did:example:reporter',
            },
        };

        const redacted = redactLogData(payload) as {
            uri: string;
            authorDid: string;
            location: string;
            nested: {
                reporterDid: string;
            };
        };

        expect(redacted.uri).toBe('at://[did]/app.patchwork.aid.post/[record]');
        expect(redacted.authorDid).toBe('did:[redacted]');
        expect(redacted.location).toBe('[redacted-object]');
        expect(redacted.nested.reporterDid).toBe('did:[redacted]');
    });

    it('provides redacted URI references and retention defaults', () => {
        expect(
            toRedactedUriReference(
                'at://did:example:alice/app.patchwork.conversation.meta/conv-1',
            ),
        ).toBe('at://[did]/app.patchwork.conversation.meta/[record]');
        expect(MODERATION_LOG_RETENTION_DAYS).toBe(7);
    });
});
