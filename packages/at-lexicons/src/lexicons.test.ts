import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    LEXICON_SCHEMA_REVISIONS,
    LEXICON_SET_VERSION,
    isSemver,
    lexiconDocs,
    recordNsid,
    safeValidateRecordPayload,
    type RecordNsid,
} from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, 'fixtures');

const readFixture = (kind: 'valid' | 'invalid', fileName: string): unknown => {
    return JSON.parse(
        readFileSync(resolve(fixturesDir, kind, fileName), 'utf8'),
    );
};

const validFixtures: Record<RecordNsid, unknown> = {
    [recordNsid.aidPost]: readFixture('valid', 'aid-post.json'),
    [recordNsid.volunteerProfile]: readFixture(
        'valid',
        'volunteer-profile.json',
    ),
    [recordNsid.conversationMeta]: readFixture(
        'valid',
        'conversation-meta.json',
    ),
    [recordNsid.moderationReport]: readFixture(
        'valid',
        'moderation-report.json',
    ),
    [recordNsid.directoryResource]: readFixture(
        'valid',
        'directory-resource.json',
    ),
};

const invalidFixtures: Record<RecordNsid, unknown> = {
    [recordNsid.aidPost]: readFixture('invalid', 'aid-post.json'),
    [recordNsid.volunteerProfile]: readFixture(
        'invalid',
        'volunteer-profile.json',
    ),
    [recordNsid.conversationMeta]: readFixture(
        'invalid',
        'conversation-meta.json',
    ),
    [recordNsid.moderationReport]: readFixture(
        'invalid',
        'moderation-report.json',
    ),
    [recordNsid.directoryResource]: readFixture(
        'invalid',
        'directory-resource.json',
    ),
};

describe('P2.1 lexicon schemas', () => {
    it('defines all required v1 lexicon documents', () => {
        expect(Object.keys(lexiconDocs).sort()).toEqual(
            Object.values(recordNsid).sort(),
        );
        expect(LEXICON_SET_VERSION).toBe('1.1.0');

        for (const nsid of Object.values(recordNsid)) {
            const lexicon = lexiconDocs[nsid];
            expect(lexicon.lexicon).toBe(1);
            expect(lexicon.id).toBe(nsid);
            expect(lexicon.defs.main.type).toBe('record');
            expect(isSemver(lexicon.revision)).toBe(true);
            expect(lexicon.revision).toBe(LEXICON_SCHEMA_REVISIONS[nsid]);
        }
    });

    it('accepts valid fixtures for each record type', () => {
        for (const nsid of Object.values(recordNsid)) {
            const parsed = safeValidateRecordPayload(nsid, validFixtures[nsid]);
            expect(parsed.success).toBe(true);
        }
    });

    it('rejects invalid fixtures for each record type', () => {
        for (const nsid of Object.values(recordNsid)) {
            const parsed = safeValidateRecordPayload(
                nsid,
                invalidFixtures[nsid],
            );
            expect(parsed.success).toBe(false);
        }
    });
});
