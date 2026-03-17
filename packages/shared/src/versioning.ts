/**
 * Immutable image versioning and rollback strategy contracts (#109).
 *
 * Defines artifact metadata, immutable tag format, rollback policies,
 * and migration rollback guidance so all services share a consistent
 * versioning model.
 */

import type { PatchworkService } from './sli.js';

// ---------------------------------------------------------------------------
// Immutable image tag format
// ---------------------------------------------------------------------------

/**
 * Immutable image tags combine semver with the git SHA to produce
 * fully deterministic, non-overwritable references.
 *
 * Format: `<semver>-<shortsha>` e.g. `0.9.0-a1b2c3d`
 */
export interface ImmutableImageTag {
    /** Semantic version component (e.g. "0.9.0"). */
    semver: string;
    /** Short git commit SHA (7+ characters). */
    gitSha: string;
    /** Full tag string: `${semver}-${gitSha}`. */
    tag: string;
}

/** Minimum git SHA length for immutable tags. */
export const MIN_GIT_SHA_LENGTH = 7;

/** Semver pattern: MAJOR.MINOR.PATCH with optional pre-release suffix. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

/** Hex-only pattern for short git SHA. */
const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/;

/**
 * Build an immutable image tag from semver and git SHA.
 * Throws if either component is invalid.
 */
export const buildImmutableTag = (
    semver: string,
    gitSha: string,
): ImmutableImageTag => {
    if (!SEMVER_PATTERN.test(semver)) {
        throw new Error(
            `Invalid semver "${semver}". Expected format: MAJOR.MINOR.PATCH[-prerelease].`,
        );
    }
    if (!GIT_SHA_PATTERN.test(gitSha)) {
        throw new Error(
            `Invalid git SHA "${gitSha}". Expected 7-40 lowercase hex characters.`,
        );
    }
    if (gitSha.length < MIN_GIT_SHA_LENGTH) {
        throw new Error(
            `Git SHA must be at least ${MIN_GIT_SHA_LENGTH} characters.`,
        );
    }
    return { semver, gitSha, tag: `${semver}-${gitSha}` };
};

/**
 * Parse an immutable tag string back into its components.
 * Returns null if the tag does not match the expected format.
 */
export const parseImmutableTag = (tag: string): ImmutableImageTag | null => {
    const lastDash = tag.lastIndexOf('-');
    if (lastDash === -1) return null;

    const semver = tag.slice(0, lastDash);
    const gitSha = tag.slice(lastDash + 1);

    if (!SEMVER_PATTERN.test(semver) || !GIT_SHA_PATTERN.test(gitSha)) {
        return null;
    }

    return { semver, gitSha, tag };
};

// ---------------------------------------------------------------------------
// Artifact metadata
// ---------------------------------------------------------------------------

export interface ArtifactMetadata {
    /** Service this artifact deploys. */
    service: PatchworkService;
    /** Immutable image tag. */
    imageTag: ImmutableImageTag;
    /** Full image reference (registry/repo:tag). */
    imageRef: string;
    /** ISO-8601 build timestamp. */
    builtAt: string;
    /** Git branch the artifact was built from. */
    branch: string;
    /** Full 40-char git commit SHA. */
    commitSha: string;
    /** CI run identifier. */
    ciRunId?: string;
    /** CI run URL for traceability. */
    ciRunUrl?: string;
}

/**
 * Build a complete artifact metadata record.
 */
export const buildArtifactMetadata = (opts: {
    service: PatchworkService;
    registry: string;
    repo: string;
    semver: string;
    gitSha: string;
    branch: string;
    commitSha: string;
    ciRunId?: string;
    ciRunUrl?: string;
}): ArtifactMetadata => {
    const imageTag = buildImmutableTag(opts.semver, opts.gitSha);
    return {
        service: opts.service,
        imageTag,
        imageRef: `${opts.registry}/${opts.repo}:${imageTag.tag}`,
        builtAt: new Date().toISOString(),
        branch: opts.branch,
        commitSha: opts.commitSha,
        ciRunId: opts.ciRunId,
        ciRunUrl: opts.ciRunUrl,
    };
};

// ---------------------------------------------------------------------------
// Rollback policy
// ---------------------------------------------------------------------------

export type RollbackTrigger =
    | 'slo-burn-exceeded'
    | 'error-rate-spike'
    | 'health-check-failure'
    | 'manual-operator'
    | 'smoke-test-failure';

export interface RollbackPolicy {
    /** Maximum number of previous versions to retain for rollback. */
    retainVersions: number;
    /** Triggers that should initiate an automatic rollback. */
    autoRollbackTriggers: readonly RollbackTrigger[];
    /** Whether rollback requires manual approval. */
    requiresApproval: boolean;
    /** Maximum time window (seconds) after deploy to allow one-command rollback. */
    rollbackWindowSeconds: number;
}

/** Default rollback policy for all services. */
export const DEFAULT_ROLLBACK_POLICY: RollbackPolicy = {
    retainVersions: 5,
    autoRollbackTriggers: [
        'slo-burn-exceeded',
        'error-rate-spike',
        'health-check-failure',
        'smoke-test-failure',
    ],
    requiresApproval: false,
    rollbackWindowSeconds: 3600, // 1 hour
};

export interface RollbackRecord {
    /** Service being rolled back. */
    service: PatchworkService;
    /** Tag we are rolling back FROM. */
    fromTag: string;
    /** Tag we are rolling back TO. */
    toTag: string;
    /** Why the rollback was triggered. */
    trigger: RollbackTrigger;
    /** ISO-8601 timestamp of the rollback. */
    rolledBackAt: string;
    /** Operator who initiated (or "automated"). */
    initiatedBy: string;
}

// ---------------------------------------------------------------------------
// Migration rollback policy
// ---------------------------------------------------------------------------

export type MigrationRollbackStrategy =
    | 'backward-compatible'
    | 'separate-rollback-migration'
    | 'manual-dba';

export interface MigrationRollbackGuidance {
    /** The recommended strategy for this migration type. */
    strategy: MigrationRollbackStrategy;
    /** Human-readable description of when this strategy applies. */
    description: string;
    /** Whether the migration can be safely rolled back without data loss. */
    safeRollback: boolean;
}

/** Standard migration rollback guidance by strategy. */
export const MIGRATION_ROLLBACK_GUIDANCE: Record<
    MigrationRollbackStrategy,
    MigrationRollbackGuidance
> = {
    'backward-compatible': {
        strategy: 'backward-compatible',
        description:
            'Migration is additive only (new columns/tables, no drops). ' +
            'Previous app version can run against the new schema. ' +
            'Rollback the app without rolling back the migration.',
        safeRollback: true,
    },
    'separate-rollback-migration': {
        strategy: 'separate-rollback-migration',
        description:
            'Migration includes a paired down-migration script. ' +
            'Run the down-migration before rolling back the app. ' +
            'Verify data integrity after the down-migration.',
        safeRollback: true,
    },
    'manual-dba': {
        strategy: 'manual-dba',
        description:
            'Migration involves destructive schema changes (drops, renames). ' +
            'Rollback requires DBA intervention with a backup restore. ' +
            'Always take a snapshot before applying this migration type.',
        safeRollback: false,
    },
};

/**
 * Determine the rollback strategy for a migration based on its characteristics.
 */
export const classifyMigrationRollback = (opts: {
    hasDropStatements: boolean;
    hasRenameStatements: boolean;
    hasDownMigration: boolean;
}): MigrationRollbackGuidance => {
    if (opts.hasDropStatements || opts.hasRenameStatements) {
        return MIGRATION_ROLLBACK_GUIDANCE['manual-dba'];
    }
    if (opts.hasDownMigration) {
        return MIGRATION_ROLLBACK_GUIDANCE['separate-rollback-migration'];
    }
    return MIGRATION_ROLLBACK_GUIDANCE['backward-compatible'];
};
