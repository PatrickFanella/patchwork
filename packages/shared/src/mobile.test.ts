import { describe, expect, it } from 'vitest';
import {
    CORE_MOBILE_FLOWS,
    DEFAULT_MOBILE_QA_CHECKS,
    getMobileFlowParity,
    getQACompletionRate,
    isMobileReleaseReady,
    mobileContractStubs,
    resolveFeatureFlag,
    type CoreMobileFlow,
    type MobileAppConfig,
    type MobileDeviceInfo,
    type MobileFeatureFlag,
    type MobileFlowParity,
    type MobileQACheck,
    type MobileReleaseChecklist,
    type MobileSessionConfig,
} from './mobile.js';

describe('mobile contracts', () => {
    // -----------------------------------------------------------------------
    // Type shape assertions
    // -----------------------------------------------------------------------

    it('CORE_MOBILE_FLOWS contains all eight core flows', () => {
        expect(CORE_MOBILE_FLOWS).toHaveLength(8);
        const expected: CoreMobileFlow[] = [
            'map',
            'feed',
            'post',
            'chat',
            'inbox',
            'notifications',
            'profile',
            'settings',
        ];
        expect([...CORE_MOBILE_FLOWS]).toEqual(expected);
    });

    it('mobileContractStubs.appConfig satisfies MobileAppConfig shape', () => {
        const config: MobileAppConfig = mobileContractStubs.appConfig;

        expect(config.platform).toBe('ios');
        expect(config.apiBaseUrl).toMatch(/^https?:\/\//);
        expect(typeof config.minAppVersion).toBe('string');
        expect(Array.isArray(config.featureFlags)).toBe(true);
        expect(config.pushNotificationConfig.enabled).toBe(true);
        expect(typeof config.offlineSyncConfig.maxQueueSize).toBe('number');
    });

    it('mobileContractStubs.deviceInfo satisfies MobileDeviceInfo shape', () => {
        const info: MobileDeviceInfo = mobileContractStubs.deviceInfo;

        expect(info.platform).toBe('ios');
        expect(typeof info.osVersion).toBe('string');
        expect(typeof info.appVersion).toBe('string');
        expect(typeof info.deviceId).toBe('string');
        expect(info.pushToken).toBeDefined();
    });

    it('mobileContractStubs.sessionConfig satisfies MobileSessionConfig shape', () => {
        const config: MobileSessionConfig = mobileContractStubs.sessionConfig;

        expect(typeof config.refreshIntervalMs).toBe('number');
        expect(typeof config.backgroundSyncEnabled).toBe('boolean');
        expect(typeof config.maxOfflineDurationMs).toBe('number');
        expect(typeof config.pushChannelId).toBe('string');
    });

    // -----------------------------------------------------------------------
    // Feature flag resolution
    // -----------------------------------------------------------------------

    it('resolveFeatureFlag returns base enabled when no platform override exists', () => {
        const flag: MobileFeatureFlag = {
            featureId: 'test-flag',
            enabled: true,
        };

        expect(resolveFeatureFlag(flag, 'ios')).toBe(true);
        expect(resolveFeatureFlag(flag, 'android')).toBe(true);
    });

    it('resolveFeatureFlag applies platform-specific override', () => {
        const flag: MobileFeatureFlag = {
            featureId: 'offline-sync',
            enabled: true,
            platformOverrides: { android: false },
        };

        expect(resolveFeatureFlag(flag, 'ios')).toBe(true);
        expect(resolveFeatureFlag(flag, 'android')).toBe(false);
    });

    it('resolveFeatureFlag handles override set to false for a specific platform', () => {
        const flag: MobileFeatureFlag = {
            featureId: 'dark-mode',
            enabled: false,
            platformOverrides: { ios: true },
        };

        expect(resolveFeatureFlag(flag, 'ios')).toBe(true);
        expect(resolveFeatureFlag(flag, 'android')).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Flow parity
    // -----------------------------------------------------------------------

    it('getMobileFlowParity returns parity entries for all core flows', () => {
        const parity = getMobileFlowParity();

        expect(parity).toHaveLength(CORE_MOBILE_FLOWS.length);
        for (const entry of parity) {
            expect(CORE_MOBILE_FLOWS).toContain(entry.flow);
            expect(typeof entry.webImplemented).toBe('boolean');
            expect(typeof entry.mobileImplemented).toBe('boolean');
            expect(typeof entry.parityNotes).toBe('string');
        }
    });

    it('getMobileFlowParity marks web-implemented flows correctly', () => {
        const parity = getMobileFlowParity();
        const mapEntry = parity.find(
            (entry) => entry.flow === 'map',
        ) as MobileFlowParity;

        expect(mapEntry.webImplemented).toBe(true);
        expect(mapEntry.mobileImplemented).toBe(false);
    });

    it('getMobileFlowParity marks profile as not web-implemented', () => {
        const parity = getMobileFlowParity();
        const profileEntry = parity.find(
            (entry) => entry.flow === 'profile',
        ) as MobileFlowParity;

        expect(profileEntry.webImplemented).toBe(false);
        expect(profileEntry.mobileImplemented).toBe(false);
    });

    it('getMobileFlowParity has no mobile-implemented flows pre-release', () => {
        const parity = getMobileFlowParity();
        const mobileImplemented = parity.filter(
            (entry) => entry.mobileImplemented,
        );
        expect(mobileImplemented).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // QA completion rate
    // -----------------------------------------------------------------------

    it('getQACompletionRate returns 1 for empty check list', () => {
        expect(getQACompletionRate([])).toBe(1);
    });

    it('getQACompletionRate returns 0 for all-pending checks', () => {
        const checks: MobileQACheck[] = [
            {
                checkId: 'a',
                category: 'auth',
                description: 'test',
                platform: 'both',
                status: 'pending',
            },
            {
                checkId: 'b',
                category: 'auth',
                description: 'test',
                platform: 'both',
                status: 'pending',
            },
        ];

        expect(getQACompletionRate(checks)).toBe(0);
    });

    it('getQACompletionRate counts pass and skip as complete', () => {
        const checks: MobileQACheck[] = [
            {
                checkId: 'a',
                category: 'auth',
                description: 'test',
                platform: 'both',
                status: 'pass',
            },
            {
                checkId: 'b',
                category: 'auth',
                description: 'test',
                platform: 'both',
                status: 'skip',
            },
            {
                checkId: 'c',
                category: 'auth',
                description: 'test',
                platform: 'both',
                status: 'fail',
            },
            {
                checkId: 'd',
                category: 'auth',
                description: 'test',
                platform: 'both',
                status: 'pending',
            },
        ];

        expect(getQACompletionRate(checks)).toBe(0.5);
    });

    it('getQACompletionRate returns 1 for all-passed checks', () => {
        const checks: MobileQACheck[] = [
            {
                checkId: 'a',
                category: 'auth',
                description: 'test',
                platform: 'both',
                status: 'pass',
            },
            {
                checkId: 'b',
                category: 'auth',
                description: 'test',
                platform: 'both',
                status: 'pass',
            },
        ];

        expect(getQACompletionRate(checks)).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Release readiness
    // -----------------------------------------------------------------------

    it('isMobileReleaseReady returns false when QA checks are pending', () => {
        const checklist: MobileReleaseChecklist = {
            ...mobileContractStubs.releaseChecklist,
            qaChecks: [...DEFAULT_MOBILE_QA_CHECKS],
        };

        expect(isMobileReleaseReady(checklist)).toBe(false);
    });

    it('isMobileReleaseReady returns false when QA checks have failures', () => {
        const checklist: MobileReleaseChecklist = {
            ...mobileContractStubs.releaseChecklist,
            qaChecks: [
                {
                    checkId: 'a',
                    category: 'auth',
                    description: 'test',
                    platform: 'both',
                    status: 'fail',
                },
            ],
        };

        expect(isMobileReleaseReady(checklist)).toBe(false);
    });

    it('isMobileReleaseReady returns false when store metadata is incomplete', () => {
        const checklist: MobileReleaseChecklist = {
            ...mobileContractStubs.releaseChecklist,
            qaChecks: [
                {
                    checkId: 'a',
                    category: 'auth',
                    description: 'test',
                    platform: 'both',
                    status: 'pass',
                },
            ],
            storeMetadata: {
                appName: '',
                bundleId: '',
                description: '',
                screenshots: [],
                keywords: [],
                category: '',
            },
        };

        expect(isMobileReleaseReady(checklist)).toBe(false);
    });

    it('isMobileReleaseReady returns false when privacy declarations are empty', () => {
        const checklist: MobileReleaseChecklist = {
            ...mobileContractStubs.releaseChecklist,
            qaChecks: [
                {
                    checkId: 'a',
                    category: 'auth',
                    description: 'test',
                    platform: 'both',
                    status: 'pass',
                },
            ],
            privacyDeclarations: [],
        };

        expect(isMobileReleaseReady(checklist)).toBe(false);
    });

    it('isMobileReleaseReady returns true when all criteria are met', () => {
        const checklist: MobileReleaseChecklist = {
            ...mobileContractStubs.releaseChecklist,
            qaChecks: [
                {
                    checkId: 'a',
                    category: 'auth',
                    description: 'test',
                    platform: 'both',
                    status: 'pass',
                },
                {
                    checkId: 'b',
                    category: 'navigation',
                    description: 'test',
                    platform: 'both',
                    status: 'skip',
                },
            ],
        };

        expect(isMobileReleaseReady(checklist)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // Default QA checks
    // -----------------------------------------------------------------------

    it('DEFAULT_MOBILE_QA_CHECKS covers all QA categories', () => {
        const categories = new Set(
            DEFAULT_MOBILE_QA_CHECKS.map((check) => check.category),
        );

        expect(categories.has('auth')).toBe(true);
        expect(categories.has('navigation')).toBe(true);
        expect(categories.has('offline')).toBe(true);
        expect(categories.has('push')).toBe(true);
        expect(categories.has('accessibility')).toBe(true);
        expect(categories.has('performance')).toBe(true);
        expect(categories.has('deep-links')).toBe(true);
    });

    it('DEFAULT_MOBILE_QA_CHECKS all start as pending', () => {
        for (const check of DEFAULT_MOBILE_QA_CHECKS) {
            expect(check.status).toBe('pending');
        }
    });

    it('DEFAULT_MOBILE_QA_CHECKS have unique checkIds', () => {
        const ids = DEFAULT_MOBILE_QA_CHECKS.map((check) => check.checkId);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
