import {
    type VerificationAudit,
    type VerificationStatus,
    type VerificationTier,
    TIER_DEFINITIONS,
    TIER_RANK,
    isExpired,
    needsRenewal,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// View model for verification status display
// ---------------------------------------------------------------------------

export interface VerificationStatusViewModel {
    tier: VerificationTier;
    tierLabel: string;
    tierDescription: string;
    expired: boolean;
    renewalNeeded: boolean;
    daysUntilExpiry: number | null;
    requirements: string[];
    auditTrail: VerificationAudit[];
    canAppeal: boolean;
}

export const buildVerificationStatusViewModel = (
    status: VerificationStatus | null,
    now: Date = new Date(),
    renewalThresholdDays: number = 30,
): VerificationStatusViewModel => {
    if (!status) {
        const def = TIER_DEFINITIONS.unverified;
        return {
            tier: 'unverified',
            tierLabel: 'Unverified',
            tierDescription:
                'This account has not completed any verification steps.',
            expired: false,
            renewalNeeded: false,
            daysUntilExpiry: null,
            requirements: def.requirements,
            auditTrail: [],
            canAppeal: true,
        };
    }

    const expired = isExpired(status, now);
    const renewal = needsRenewal(status, renewalThresholdDays, now);

    let daysUntilExpiry: number | null = null;
    if (status.expiresAt !== null) {
        const diff =
            new Date(status.expiresAt).getTime() - now.getTime();
        daysUntilExpiry = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
    }

    const def = TIER_DEFINITIONS[status.tier];

    return {
        tier: status.tier,
        tierLabel: TIER_LABEL_MAP[status.tier],
        tierDescription: TIER_DESCRIPTION_MAP[status.tier],
        expired,
        renewalNeeded: renewal && !expired,
        daysUntilExpiry,
        requirements: def.requirements,
        auditTrail: status.auditTrail,
        canAppeal: !expired && status.tier !== 'org_verified',
    };
};

const TIER_LABEL_MAP: Record<VerificationTier, string> = {
    unverified: 'Unverified',
    basic: 'Basic',
    verified: 'Verified',
    trusted: 'Trusted',
    org_verified: 'Organisation Verified',
};

const TIER_DESCRIPTION_MAP: Record<VerificationTier, string> = {
    unverified: 'This account has not completed any verification steps.',
    basic: 'Basic verification: email confirmed and profile completed.',
    verified:
        'Fully verified: identity checked, safety training completed, and community reference provided.',
    trusted:
        'Trusted volunteer: long-standing verified member with a strong track record.',
    org_verified:
        'Organisation verified: officially partnered organisation with verified identity.',
};

// ---------------------------------------------------------------------------
// Appeal form state
// ---------------------------------------------------------------------------

export interface AppealFormState {
    requestedTier: VerificationTier;
    reason: string;
    isSubmitting: boolean;
    validationErrors: string[];
    submitted: boolean;
}

export const createInitialAppealFormState = (
    currentTier: VerificationTier,
): AppealFormState => {
    // Default to the next tier up
    const rank = TIER_RANK[currentTier];
    const allTiers: VerificationTier[] = [
        'unverified',
        'basic',
        'verified',
        'trusted',
        'org_verified',
    ];
    const nextTier = allTiers.find(t => TIER_RANK[t] > rank) ?? currentTier;

    return {
        requestedTier: nextTier,
        reason: '',
        isSubmitting: false,
        validationErrors: [],
        submitted: false,
    };
};

export const validateAppealForm = (
    state: AppealFormState,
    currentTier: VerificationTier,
): string[] => {
    const errors: string[] = [];

    if (TIER_RANK[state.requestedTier] <= TIER_RANK[currentTier]) {
        errors.push('You can only appeal to a tier higher than your current one.');
    }

    if (state.reason.trim().length < 10) {
        errors.push('Please provide a reason with at least 10 characters.');
    }

    if (state.reason.length > 2000) {
        errors.push('Reason must be 2000 characters or fewer.');
    }

    return errors;
};

// ---------------------------------------------------------------------------
// Admin verification management state
// ---------------------------------------------------------------------------

export interface AdminVerificationEntry {
    did: string;
    displayName: string;
    currentTier: VerificationTier;
    expired: boolean;
    renewalNeeded: boolean;
    pendingAppeals: number;
}

export interface AdminVerificationManagementState {
    entries: AdminVerificationEntry[];
    selectedDid: string | null;
    filterTier: VerificationTier | 'all';
    filterExpired: boolean;
}

export const createInitialAdminState = (): AdminVerificationManagementState => ({
    entries: [],
    selectedDid: null,
    filterTier: 'all',
    filterExpired: false,
});

export const filterAdminEntries = (
    state: AdminVerificationManagementState,
): AdminVerificationEntry[] => {
    return state.entries.filter(entry => {
        if (state.filterTier !== 'all' && entry.currentTier !== state.filterTier) {
            return false;
        }
        if (state.filterExpired && !entry.expired) {
            return false;
        }
        return true;
    });
};

// ---------------------------------------------------------------------------
// Badge display helpers (pure data, no React)
// ---------------------------------------------------------------------------

export interface VerificationBadgeViewModel {
    tier: VerificationTier;
    label: string;
    showExpiryWarning: boolean;
    showExpired: boolean;
}

export const buildVerificationBadgeViewModel = (
    status: VerificationStatus | null,
    now: Date = new Date(),
    renewalThresholdDays: number = 30,
): VerificationBadgeViewModel => {
    if (!status) {
        return {
            tier: 'unverified',
            label: 'Unverified',
            showExpiryWarning: false,
            showExpired: false,
        };
    }

    const expired = isExpired(status, now);
    const renewal = !expired && needsRenewal(status, renewalThresholdDays, now);

    return {
        tier: status.tier,
        label: TIER_LABEL_MAP[status.tier],
        showExpiryWarning: renewal,
        showExpired: expired,
    };
};
