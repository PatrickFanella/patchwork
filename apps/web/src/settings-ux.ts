import {
    defaultUserSettings,
    userSettingsSchema,
    type ContactPreferences,
    type GeoSharingPrecision,
    type NotificationPreferences,
    type PrivacyLevel,
    type SettingsChangeAudit,
    type UserSettings,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Section model
// ---------------------------------------------------------------------------

export type SettingsSection =
    | 'privacy'
    | 'contact'
    | 'notifications'
    | 'account'
    | 'legal';

export const settingsSections: readonly SettingsSection[] = [
    'privacy',
    'contact',
    'notifications',
    'account',
    'legal',
];

export const settingsSectionLabels: Readonly<Record<SettingsSection, string>> = {
    privacy: 'Privacy',
    contact: 'Contact',
    notifications: 'Notifications',
    account: 'Account',
    legal: 'Legal & Policies',
};

export const settingsSectionDescriptions: Readonly<
    Record<SettingsSection, string>
> = {
    privacy:
        'Control your visibility level and geo-sharing precision within the network.',
    contact:
        'Manage who can reach you and what contact information is shared.',
    notifications:
        'Choose which events trigger notifications.',
    account:
        'Export your data or deactivate your account.',
    legal:
        'Terms of Service, Privacy Policy, and Community Guidelines.',
};

// ---------------------------------------------------------------------------
// Legal & Policies links
// ---------------------------------------------------------------------------

export interface LegalPolicyLink {
    label: string;
    route: string;
    description: string;
}

export const legalPolicyLinks: readonly LegalPolicyLink[] = [
    {
        label: 'Terms of Service',
        route: '/legal/terms',
        description: 'Platform terms of service and user agreement.',
    },
    {
        label: 'Privacy Policy',
        route: '/legal/privacy',
        description: 'How we collect, use, and protect your data.',
    },
    {
        label: 'Community Guidelines',
        route: '/legal/community-guidelines',
        description: 'Expected behaviour, prohibited content, and enforcement.',
    },
];

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export interface SettingsViewModel {
    settings: UserSettings;
    activeSection: SettingsSection;
    isDirty: boolean;
    isSaving: boolean;
    saveError?: string;
    saveSuccess?: string;
    auditEntries: readonly SettingsChangeAudit[];
    isLoadingAudit: boolean;
    accountActionPending?: 'deactivate' | 'export';
    accountActionResult?: string;
}

export const defaultSettingsViewModel: SettingsViewModel = {
    settings: { ...defaultUserSettings },
    activeSection: 'privacy',
    isDirty: false,
    isSaving: false,
    auditEntries: [],
    isLoadingAudit: false,
};

// ---------------------------------------------------------------------------
// Patch helpers
// ---------------------------------------------------------------------------

export type SettingsPatch =
    | { section: 'privacy'; field: 'privacyLevel'; value: PrivacyLevel }
    | { section: 'privacy'; field: 'geoSharingEnabled'; value: boolean }
    | {
          section: 'privacy';
          field: 'geoSharingPrecision';
          value: GeoSharingPrecision;
      }
    | {
          section: 'contact';
          field: keyof ContactPreferences;
          value: boolean;
      }
    | {
          section: 'notifications';
          field: keyof NotificationPreferences;
          value: boolean;
      };

export const applySettingsPatch = (
    current: UserSettings,
    patch: SettingsPatch,
): UserSettings => {
    const next = structuredClone(current);

    switch (patch.section) {
        case 'privacy':
            if (patch.field === 'privacyLevel') {
                next.privacyLevel = patch.value;
            } else if (patch.field === 'geoSharingEnabled') {
                next.geoSharingEnabled = patch.value;
            } else if (patch.field === 'geoSharingPrecision') {
                next.geoSharingPrecision = patch.value;
            }
            break;
        case 'contact':
            next.contactPreferences = {
                ...next.contactPreferences,
                [patch.field]: patch.value,
            };
            break;
        case 'notifications':
            next.notificationPreferences = {
                ...next.notificationPreferences,
                [patch.field]: patch.value,
            };
            break;
    }

    return next;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface SettingsValidationResult {
    ok: boolean;
    errors: string[];
}

export const validateSettings = (
    settings: UserSettings,
): SettingsValidationResult => {
    const result = userSettingsSchema.safeParse(settings);
    if (result.success) {
        return { ok: true, errors: [] };
    }

    return {
        ok: false,
        errors: result.error.issues.map(
            issue => `${issue.path.join('.')}: ${issue.message}`,
        ),
    };
};

// ---------------------------------------------------------------------------
// Dirty state check
// ---------------------------------------------------------------------------

export const isSettingsDirty = (
    current: UserSettings,
    original: UserSettings,
): boolean => {
    return JSON.stringify(current) !== JSON.stringify(original);
};
