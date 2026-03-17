import { describe, expect, it } from 'vitest';
import type { VerificationStatus } from '@patchwork/shared';
import {
    buildVerificationBadgeViewModel,
    buildVerificationStatusViewModel,
    createInitialAdminState,
    createInitialAppealFormState,
    filterAdminEntries,
    validateAppealForm,
    type AdminVerificationEntry,
} from './verification-ux.js';

const ADMIN_DID = 'did:example:admin';

const makeStatus = (
    tier: 'unverified' | 'basic' | 'verified' | 'trusted' | 'org_verified',
    overrides: Partial<VerificationStatus> = {},
): VerificationStatus => ({
    tier,
    grantedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    verifiedBy: ADMIN_DID,
    auditTrail: [
        {
            action: 'grant',
            actor: ADMIN_DID,
            timestamp: '2026-01-01T00:00:00.000Z',
            reason: 'Initial grant',
            previousTier: 'unverified',
            newTier: tier,
        },
    ],
    ...overrides,
});

// ---------------------------------------------------------------------------
// buildVerificationStatusViewModel
// ---------------------------------------------------------------------------

describe('buildVerificationStatusViewModel', () => {
    it('returns unverified view model for null status', () => {
        const vm = buildVerificationStatusViewModel(null);
        expect(vm.tier).toBe('unverified');
        expect(vm.tierLabel).toBe('Unverified');
        expect(vm.expired).toBe(false);
        expect(vm.renewalNeeded).toBe(false);
        expect(vm.daysUntilExpiry).toBeNull();
        expect(vm.canAppeal).toBe(true);
    });

    it('returns correct values for a basic status', () => {
        const status = makeStatus('basic');
        const now = new Date('2026-03-01T00:00:00.000Z');
        const vm = buildVerificationStatusViewModel(status, now);

        expect(vm.tier).toBe('basic');
        expect(vm.tierLabel).toBe('Basic');
        expect(vm.expired).toBe(false);
        expect(vm.daysUntilExpiry).toBeGreaterThan(0);
        expect(vm.auditTrail).toHaveLength(1);
    });

    it('shows expired when expiry is in the past', () => {
        const status = makeStatus('basic', {
            expiresAt: '2026-01-15T00:00:00.000Z',
        });
        const now = new Date('2026-03-01T00:00:00.000Z');
        const vm = buildVerificationStatusViewModel(status, now);

        expect(vm.expired).toBe(true);
        expect(vm.daysUntilExpiry).toBe(0);
    });

    it('shows renewalNeeded when within threshold', () => {
        const status = makeStatus('verified', {
            expiresAt: '2026-03-20T00:00:00.000Z',
        });
        const now = new Date('2026-03-01T00:00:00.000Z');
        const vm = buildVerificationStatusViewModel(status, now, 30);

        expect(vm.renewalNeeded).toBe(true);
        expect(vm.expired).toBe(false);
    });

    it('does not show renewalNeeded when expired (expired takes precedence)', () => {
        const status = makeStatus('verified', {
            expiresAt: '2026-02-01T00:00:00.000Z',
        });
        const now = new Date('2026-03-01T00:00:00.000Z');
        const vm = buildVerificationStatusViewModel(status, now, 30);

        expect(vm.expired).toBe(true);
        expect(vm.renewalNeeded).toBe(false);
    });

    it('org_verified cannot appeal', () => {
        const status = makeStatus('org_verified');
        const now = new Date('2026-03-01T00:00:00.000Z');
        const vm = buildVerificationStatusViewModel(status, now);

        expect(vm.canAppeal).toBe(false);
    });

    it('null expiresAt results in null daysUntilExpiry', () => {
        const status = makeStatus('unverified', { expiresAt: null });
        const vm = buildVerificationStatusViewModel(status);

        expect(vm.daysUntilExpiry).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// buildVerificationBadgeViewModel
// ---------------------------------------------------------------------------

describe('buildVerificationBadgeViewModel', () => {
    it('returns unverified badge for null status', () => {
        const vm = buildVerificationBadgeViewModel(null);
        expect(vm.tier).toBe('unverified');
        expect(vm.label).toBe('Unverified');
        expect(vm.showExpiryWarning).toBe(false);
        expect(vm.showExpired).toBe(false);
    });

    it('shows expiry warning when renewal is needed', () => {
        const status = makeStatus('basic', {
            expiresAt: '2026-03-20T00:00:00.000Z',
        });
        const now = new Date('2026-03-01T00:00:00.000Z');
        const vm = buildVerificationBadgeViewModel(status, now, 30);

        expect(vm.showExpiryWarning).toBe(true);
        expect(vm.showExpired).toBe(false);
    });

    it('shows expired when past expiry', () => {
        const status = makeStatus('basic', {
            expiresAt: '2026-02-01T00:00:00.000Z',
        });
        const now = new Date('2026-03-01T00:00:00.000Z');
        const vm = buildVerificationBadgeViewModel(status, now);

        expect(vm.showExpired).toBe(true);
        expect(vm.showExpiryWarning).toBe(false);
    });

    it('returns correct label for each tier', () => {
        const tiers: Array<{
            tier: VerificationStatus['tier'];
            label: string;
        }> = [
            { tier: 'unverified', label: 'Unverified' },
            { tier: 'basic', label: 'Basic' },
            { tier: 'verified', label: 'Verified' },
            { tier: 'trusted', label: 'Trusted' },
            { tier: 'org_verified', label: 'Organisation Verified' },
        ];

        for (const { tier, label } of tiers) {
            const status = makeStatus(tier, { expiresAt: '2099-01-01T00:00:00.000Z' });
            const vm = buildVerificationBadgeViewModel(status);
            expect(vm.label).toBe(label);
        }
    });
});

// ---------------------------------------------------------------------------
// Appeal form validation
// ---------------------------------------------------------------------------

describe('validateAppealForm', () => {
    it('returns no errors for valid appeal', () => {
        const errors = validateAppealForm(
            {
                requestedTier: 'verified',
                reason: 'I have completed all requirements and would like an upgrade.',
                isSubmitting: false,
                validationErrors: [],
                submitted: false,
            },
            'basic',
        );
        expect(errors).toHaveLength(0);
    });

    it('rejects appeal to same tier', () => {
        const errors = validateAppealForm(
            {
                requestedTier: 'basic',
                reason: 'I want to stay at basic',
                isSubmitting: false,
                validationErrors: [],
                submitted: false,
            },
            'basic',
        );
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('higher');
    });

    it('rejects appeal to lower tier', () => {
        const errors = validateAppealForm(
            {
                requestedTier: 'unverified',
                reason: 'Downgrade please',
                isSubmitting: false,
                validationErrors: [],
                submitted: false,
            },
            'basic',
        );
        expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects short reason', () => {
        const errors = validateAppealForm(
            {
                requestedTier: 'verified',
                reason: 'short',
                isSubmitting: false,
                validationErrors: [],
                submitted: false,
            },
            'basic',
        );
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.includes('10 characters'))).toBe(true);
    });

    it('rejects overly long reason', () => {
        const errors = validateAppealForm(
            {
                requestedTier: 'verified',
                reason: 'x'.repeat(2001),
                isSubmitting: false,
                validationErrors: [],
                submitted: false,
            },
            'basic',
        );
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.includes('2000'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// createInitialAppealFormState
// ---------------------------------------------------------------------------

describe('createInitialAppealFormState', () => {
    it('defaults to the next tier up', () => {
        const state = createInitialAppealFormState('basic');
        expect(state.requestedTier).toBe('verified');
        expect(state.reason).toBe('');
        expect(state.isSubmitting).toBe(false);
        expect(state.submitted).toBe(false);
    });

    it('defaults to next tier for unverified', () => {
        const state = createInitialAppealFormState('unverified');
        expect(state.requestedTier).toBe('basic');
    });

    it('defaults to org_verified for trusted', () => {
        const state = createInitialAppealFormState('trusted');
        expect(state.requestedTier).toBe('org_verified');
    });
});

// ---------------------------------------------------------------------------
// Admin management state
// ---------------------------------------------------------------------------

describe('admin verification management', () => {
    it('creates initial state with empty entries', () => {
        const state = createInitialAdminState();
        expect(state.entries).toHaveLength(0);
        expect(state.selectedDid).toBeNull();
        expect(state.filterTier).toBe('all');
        expect(state.filterExpired).toBe(false);
    });

    it('filters entries by tier', () => {
        const entries: AdminVerificationEntry[] = [
            {
                did: 'did:example:a',
                displayName: 'Alice',
                currentTier: 'basic',
                expired: false,
                renewalNeeded: false,
                pendingAppeals: 0,
            },
            {
                did: 'did:example:b',
                displayName: 'Bob',
                currentTier: 'verified',
                expired: false,
                renewalNeeded: true,
                pendingAppeals: 1,
            },
        ];

        const filtered = filterAdminEntries({
            entries,
            selectedDid: null,
            filterTier: 'basic',
            filterExpired: false,
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0]!.did).toBe('did:example:a');
    });

    it('filters entries by expired status', () => {
        const entries: AdminVerificationEntry[] = [
            {
                did: 'did:example:a',
                displayName: 'Alice',
                currentTier: 'basic',
                expired: true,
                renewalNeeded: false,
                pendingAppeals: 0,
            },
            {
                did: 'did:example:b',
                displayName: 'Bob',
                currentTier: 'verified',
                expired: false,
                renewalNeeded: false,
                pendingAppeals: 0,
            },
        ];

        const filtered = filterAdminEntries({
            entries,
            selectedDid: null,
            filterTier: 'all',
            filterExpired: true,
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0]!.did).toBe('did:example:a');
    });

    it('returns all entries when no filters are applied', () => {
        const entries: AdminVerificationEntry[] = [
            {
                did: 'did:example:a',
                displayName: 'Alice',
                currentTier: 'basic',
                expired: false,
                renewalNeeded: false,
                pendingAppeals: 0,
            },
            {
                did: 'did:example:b',
                displayName: 'Bob',
                currentTier: 'verified',
                expired: false,
                renewalNeeded: false,
                pendingAppeals: 0,
            },
        ];

        const filtered = filterAdminEntries({
            entries,
            selectedDid: null,
            filterTier: 'all',
            filterExpired: false,
        });

        expect(filtered).toHaveLength(2);
    });
});
