import { describe, expect, it } from 'vitest';
import {
    buildImmutableTag,
    parseImmutableTag,
    buildArtifactMetadata,
    DEFAULT_ROLLBACK_POLICY,
    MIGRATION_ROLLBACK_GUIDANCE,
    classifyMigrationRollback,
    MIN_GIT_SHA_LENGTH,
} from './versioning.js';

describe('buildImmutableTag', () => {
    it('builds a valid tag from semver and git SHA', () => {
        const tag = buildImmutableTag('0.9.0', 'a1b2c3d');
        expect(tag.semver).toBe('0.9.0');
        expect(tag.gitSha).toBe('a1b2c3d');
        expect(tag.tag).toBe('0.9.0-a1b2c3d');
    });

    it('supports pre-release semver', () => {
        const tag = buildImmutableTag('1.0.0-beta.1', 'abcdef0');
        expect(tag.tag).toBe('1.0.0-beta.1-abcdef0');
    });

    it('rejects invalid semver', () => {
        expect(() => buildImmutableTag('not-semver', 'a1b2c3d')).toThrow(
            /Invalid semver/,
        );
    });

    it('rejects semver without patch version', () => {
        expect(() => buildImmutableTag('1.0', 'a1b2c3d')).toThrow(
            /Invalid semver/,
        );
    });

    it('rejects git SHA with uppercase letters', () => {
        expect(() => buildImmutableTag('0.9.0', 'A1B2C3D')).toThrow(
            /Invalid git SHA/,
        );
    });

    it('rejects git SHA shorter than minimum length', () => {
        expect(() => buildImmutableTag('0.9.0', 'abc')).toThrow(
            /Invalid git SHA/,
        );
    });

    it('accepts full 40-char git SHA', () => {
        const sha = 'a'.repeat(40);
        const tag = buildImmutableTag('0.9.0', sha);
        expect(tag.gitSha).toBe(sha);
    });
});

describe('parseImmutableTag', () => {
    it('parses a valid immutable tag', () => {
        const result = parseImmutableTag('0.9.0-a1b2c3d');
        expect(result).not.toBeNull();
        expect(result!.semver).toBe('0.9.0');
        expect(result!.gitSha).toBe('a1b2c3d');
    });

    it('parses tag with pre-release semver', () => {
        const result = parseImmutableTag('1.0.0-beta.1-abcdef0');
        expect(result).not.toBeNull();
        expect(result!.semver).toBe('1.0.0-beta.1');
        expect(result!.gitSha).toBe('abcdef0');
    });

    it('returns null for tags without a dash', () => {
        expect(parseImmutableTag('0.9.0')).toBeNull();
    });

    it('returns null for invalid format', () => {
        expect(parseImmutableTag('notvalid')).toBeNull();
    });

    it('returns null when SHA portion is too short', () => {
        expect(parseImmutableTag('0.9.0-abc')).toBeNull();
    });

    it('roundtrips with buildImmutableTag', () => {
        const original = buildImmutableTag('2.1.0', 'deadbeef');
        const parsed = parseImmutableTag(original.tag);
        expect(parsed).toEqual(original);
    });
});

describe('buildArtifactMetadata', () => {
    it('builds complete artifact metadata', () => {
        const metadata = buildArtifactMetadata({
            service: 'api',
            registry: 'ghcr.io',
            repo: 'patchwork/api',
            semver: '0.9.0',
            gitSha: 'a1b2c3d',
            branch: 'main',
            commitSha: 'a'.repeat(40),
            ciRunId: '12345',
            ciRunUrl: 'https://github.com/runs/12345',
        });

        expect(metadata.service).toBe('api');
        expect(metadata.imageTag.tag).toBe('0.9.0-a1b2c3d');
        expect(metadata.imageRef).toBe('ghcr.io/patchwork/api:0.9.0-a1b2c3d');
        expect(metadata.branch).toBe('main');
        expect(metadata.commitSha).toHaveLength(40);
        expect(metadata.builtAt).toBeTruthy();
        expect(metadata.ciRunId).toBe('12345');
    });

    it('works without optional CI fields', () => {
        const metadata = buildArtifactMetadata({
            service: 'indexer',
            registry: 'ghcr.io',
            repo: 'patchwork/indexer',
            semver: '1.0.0',
            gitSha: 'b2c3d4e',
            branch: 'main',
            commitSha: 'b'.repeat(40),
        });

        expect(metadata.ciRunId).toBeUndefined();
        expect(metadata.ciRunUrl).toBeUndefined();
    });
});

describe('MIN_GIT_SHA_LENGTH', () => {
    it('is 7 characters', () => {
        expect(MIN_GIT_SHA_LENGTH).toBe(7);
    });
});

describe('DEFAULT_ROLLBACK_POLICY', () => {
    it('retains at least 3 versions', () => {
        expect(DEFAULT_ROLLBACK_POLICY.retainVersions).toBeGreaterThanOrEqual(3);
    });

    it('includes auto-rollback triggers', () => {
        expect(DEFAULT_ROLLBACK_POLICY.autoRollbackTriggers.length).toBeGreaterThan(0);
        expect(DEFAULT_ROLLBACK_POLICY.autoRollbackTriggers).toContain(
            'error-rate-spike',
        );
        expect(DEFAULT_ROLLBACK_POLICY.autoRollbackTriggers).toContain(
            'health-check-failure',
        );
    });

    it('has a rollback window', () => {
        expect(DEFAULT_ROLLBACK_POLICY.rollbackWindowSeconds).toBeGreaterThan(0);
    });
});

describe('MIGRATION_ROLLBACK_GUIDANCE', () => {
    it('defines all three strategies', () => {
        const strategies = Object.keys(MIGRATION_ROLLBACK_GUIDANCE).sort();
        expect(strategies).toEqual([
            'backward-compatible',
            'manual-dba',
            'separate-rollback-migration',
        ]);
    });

    it('backward-compatible is safe to rollback', () => {
        expect(
            MIGRATION_ROLLBACK_GUIDANCE['backward-compatible'].safeRollback,
        ).toBe(true);
    });

    it('manual-dba is not safe to rollback', () => {
        expect(MIGRATION_ROLLBACK_GUIDANCE['manual-dba'].safeRollback).toBe(
            false,
        );
    });

    it('every strategy has a description', () => {
        for (const guidance of Object.values(MIGRATION_ROLLBACK_GUIDANCE)) {
            expect(guidance.description).toBeTruthy();
        }
    });
});

describe('classifyMigrationRollback', () => {
    it('returns backward-compatible for additive-only migrations', () => {
        const result = classifyMigrationRollback({
            hasDropStatements: false,
            hasRenameStatements: false,
            hasDownMigration: false,
        });
        expect(result.strategy).toBe('backward-compatible');
        expect(result.safeRollback).toBe(true);
    });

    it('returns separate-rollback-migration when down migration exists', () => {
        const result = classifyMigrationRollback({
            hasDropStatements: false,
            hasRenameStatements: false,
            hasDownMigration: true,
        });
        expect(result.strategy).toBe('separate-rollback-migration');
    });

    it('returns manual-dba for drop statements', () => {
        const result = classifyMigrationRollback({
            hasDropStatements: true,
            hasRenameStatements: false,
            hasDownMigration: true,
        });
        expect(result.strategy).toBe('manual-dba');
        expect(result.safeRollback).toBe(false);
    });

    it('returns manual-dba for rename statements', () => {
        const result = classifyMigrationRollback({
            hasDropStatements: false,
            hasRenameStatements: true,
            hasDownMigration: false,
        });
        expect(result.strategy).toBe('manual-dba');
    });
});
