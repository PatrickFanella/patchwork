/**
 * Mobile first release contracts.
 *
 * Defines platform types, app configuration, device information,
 * session config, feature flags, core flow parity tracking,
 * QA check matrix, and store release checklist contracts.
 */

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export type MobilePlatform = 'ios' | 'android';

// ---------------------------------------------------------------------------
// App configuration
// ---------------------------------------------------------------------------

export interface MobileAppConfig {
    platform: MobilePlatform;
    apiBaseUrl: string;
    minAppVersion: string;
    featureFlags: MobileFeatureFlag[];
    pushNotificationConfig: {
        enabled: boolean;
        channelId: string;
        soundEnabled: boolean;
        badgeEnabled: boolean;
    };
    offlineSyncConfig: {
        enabled: boolean;
        maxQueueSize: number;
        syncIntervalMs: number;
        maxOfflineDurationMs: number;
    };
}

// ---------------------------------------------------------------------------
// Device info
// ---------------------------------------------------------------------------

export interface MobileDeviceInfo {
    platform: MobilePlatform;
    osVersion: string;
    appVersion: string;
    deviceId: string;
    pushToken?: string;
}

// ---------------------------------------------------------------------------
// Session config
// ---------------------------------------------------------------------------

export interface MobileSessionConfig {
    refreshIntervalMs: number;
    backgroundSyncEnabled: boolean;
    maxOfflineDurationMs: number;
    pushChannelId: string;
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export interface MobileFeatureFlag {
    featureId: string;
    enabled: boolean;
    platformOverrides?: Partial<Record<MobilePlatform, boolean>>;
}

/**
 * Resolve the effective enabled state for a feature flag on a given platform.
 * Platform-specific overrides take precedence over the base `enabled` value.
 */
export const resolveFeatureFlag = (
    flag: MobileFeatureFlag,
    platform: MobilePlatform,
): boolean => {
    const override = flag.platformOverrides?.[platform];
    return override !== undefined ? override : flag.enabled;
};

// ---------------------------------------------------------------------------
// Core mobile flows
// ---------------------------------------------------------------------------

export type CoreMobileFlow =
    | 'map'
    | 'feed'
    | 'post'
    | 'chat'
    | 'inbox'
    | 'notifications'
    | 'profile'
    | 'settings';

export const CORE_MOBILE_FLOWS: readonly CoreMobileFlow[] = [
    'map',
    'feed',
    'post',
    'chat',
    'inbox',
    'notifications',
    'profile',
    'settings',
] as const;

// ---------------------------------------------------------------------------
// Flow parity tracking
// ---------------------------------------------------------------------------

export interface MobileFlowParity {
    flow: CoreMobileFlow;
    webImplemented: boolean;
    mobileImplemented: boolean;
    parityNotes: string;
}

/**
 * Returns flow parity status for all core mobile flows.
 * Web implementation status is derived from the app-shell route map;
 * mobile implementation status is initially false (pre-release).
 */
export const getMobileFlowParity = (): MobileFlowParity[] => {
    const webImplementedFlows: readonly CoreMobileFlow[] = [
        'map',
        'feed',
        'post',
        'chat',
        'inbox',
        'notifications',
        'settings',
    ];

    return CORE_MOBILE_FLOWS.map((flow) => ({
        flow,
        webImplemented: webImplementedFlows.includes(flow),
        mobileImplemented: false,
        parityNotes:
            webImplementedFlows.includes(flow)
                ? 'Web implemented; mobile pending first release.'
                : 'Not yet implemented on either platform.',
    }));
};

// ---------------------------------------------------------------------------
// QA check matrix
// ---------------------------------------------------------------------------

export type MobileQACategory =
    | 'auth'
    | 'navigation'
    | 'offline'
    | 'push'
    | 'accessibility'
    | 'performance'
    | 'deep-links';

export type MobileQAStatus = 'pass' | 'fail' | 'skip' | 'pending';

export interface MobileQACheck {
    checkId: string;
    category: MobileQACategory;
    description: string;
    platform: MobilePlatform | 'both';
    status: MobileQAStatus;
    testedOn?: string;
    notes?: string;
}

// ---------------------------------------------------------------------------
// Release checklist
// ---------------------------------------------------------------------------

export interface StoreMetadata {
    appName: string;
    bundleId: string;
    description: string;
    screenshots: string[];
    keywords: string[];
    category: string;
}

export type MobileApprovalStatus =
    | 'draft'
    | 'qa-complete'
    | 'submitted'
    | 'approved'
    | 'rejected';

export interface MobileReleaseChecklist {
    version: string;
    platform: MobilePlatform;
    qaChecks: MobileQACheck[];
    storeMetadata: StoreMetadata;
    privacyDeclarations: string[];
    approvalStatus: MobileApprovalStatus;
}

// ---------------------------------------------------------------------------
// Release readiness helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a mobile release checklist is ready for submission.
 * All QA checks must pass (or be explicitly skipped), store metadata must be
 * complete, and at least one privacy declaration must be present.
 */
export const isMobileReleaseReady = (
    checklist: MobileReleaseChecklist,
): boolean => {
    const allChecksPassed = checklist.qaChecks.every(
        (check) => check.status === 'pass' || check.status === 'skip',
    );

    const hasStoreMetadata =
        checklist.storeMetadata.appName.length > 0 &&
        checklist.storeMetadata.bundleId.length > 0 &&
        checklist.storeMetadata.description.length > 0;

    const hasPrivacyDeclarations = checklist.privacyDeclarations.length > 0;

    return allChecksPassed && hasStoreMetadata && hasPrivacyDeclarations;
};

/**
 * Compute the completion rate of QA checks as a number between 0 and 1.
 * Checks with status 'pass' or 'skip' are considered complete.
 * Returns 1 when there are no checks.
 */
export const getQACompletionRate = (checks: MobileQACheck[]): number => {
    if (checks.length === 0) {
        return 1;
    }

    const completed = checks.filter(
        (check) => check.status === 'pass' || check.status === 'skip',
    ).length;

    return completed / checks.length;
};

// ---------------------------------------------------------------------------
// Default QA checks for first release
// ---------------------------------------------------------------------------

export const DEFAULT_MOBILE_QA_CHECKS: readonly MobileQACheck[] = [
    {
        checkId: 'auth-login',
        category: 'auth',
        description: 'User can log in with AT Protocol handle and password.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'auth-session-refresh',
        category: 'auth',
        description: 'Session refreshes automatically before expiry.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'auth-logout',
        category: 'auth',
        description: 'User can log out and session is cleared.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'nav-tab-bar',
        category: 'navigation',
        description: 'Bottom tab bar navigates to all core flows.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'nav-back',
        category: 'navigation',
        description: 'Back navigation works consistently across flows.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'nav-deep-link',
        category: 'deep-links',
        description: 'Deep links open the correct screen with parameters.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'offline-queue',
        category: 'offline',
        description: 'Actions queued while offline sync when connectivity returns.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'offline-indicator',
        category: 'offline',
        description: 'Offline indicator is displayed when network is unavailable.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'push-registration',
        category: 'push',
        description: 'Push notification token is registered on app launch.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'push-receive',
        category: 'push',
        description: 'Push notifications are received in foreground and background.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'push-tap-navigation',
        category: 'push',
        description: 'Tapping a push notification navigates to the correct screen.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'a11y-screen-reader',
        category: 'accessibility',
        description: 'All interactive elements are accessible via screen reader.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'a11y-touch-target',
        category: 'accessibility',
        description: 'Touch targets meet minimum 44x44 point size.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'perf-cold-start',
        category: 'performance',
        description: 'Cold start time is under 3 seconds on target devices.',
        platform: 'both',
        status: 'pending',
    },
    {
        checkId: 'perf-scroll',
        category: 'performance',
        description: 'Feed and map scroll at 60fps on target devices.',
        platform: 'both',
        status: 'pending',
    },
] as const;

// ---------------------------------------------------------------------------
// Contract stubs for testing
// ---------------------------------------------------------------------------

export const mobileContractStubs = {
    appConfig: {
        platform: 'ios',
        apiBaseUrl: 'https://api.patchwork.local',
        minAppVersion: '1.0.0',
        featureFlags: [
            {
                featureId: 'offline-sync',
                enabled: true,
                platformOverrides: { android: false },
            },
        ],
        pushNotificationConfig: {
            enabled: true,
            channelId: 'patchwork-default',
            soundEnabled: true,
            badgeEnabled: true,
        },
        offlineSyncConfig: {
            enabled: true,
            maxQueueSize: 100,
            syncIntervalMs: 30_000,
            maxOfflineDurationMs: 24 * 60 * 60 * 1000,
        },
    } satisfies MobileAppConfig,

    deviceInfo: {
        platform: 'ios',
        osVersion: '17.4',
        appVersion: '1.0.0',
        deviceId: 'device-stub-001',
        pushToken: 'push-token-stub-abc123',
    } satisfies MobileDeviceInfo,

    sessionConfig: {
        refreshIntervalMs: 5 * 60 * 1000,
        backgroundSyncEnabled: true,
        maxOfflineDurationMs: 24 * 60 * 60 * 1000,
        pushChannelId: 'patchwork-default',
    } satisfies MobileSessionConfig,

    releaseChecklist: {
        version: '1.0.0',
        platform: 'ios',
        qaChecks: [...DEFAULT_MOBILE_QA_CHECKS],
        storeMetadata: {
            appName: 'Patchwork',
            bundleId: 'app.patchwork.mobile',
            description: 'Mutual aid coordination powered by AT Protocol.',
            screenshots: ['splash.png', 'map.png', 'feed.png'],
            keywords: ['mutual-aid', 'community', 'coordination'],
            category: 'Social Networking',
        },
        privacyDeclarations: [
            'Location data is used only for approximate-area discovery.',
            'Push tokens are stored for notification delivery only.',
        ],
        approvalStatus: 'draft',
    } satisfies MobileReleaseChecklist,
};
