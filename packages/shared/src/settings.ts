import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Canonical, user-facing audience contract. */
export const privacyLevels = ['public', 'authenticated', 'hidden'] as const;
export type PrivacyLevel = (typeof privacyLevels)[number];

/** Location is deliberately independent from audience. */
export const geoSharingPrecisions = ['approximate', 'hidden'] as const;
export type GeoSharingPrecision = (typeof geoSharingPrecisions)[number];

const legacyPrivacyLevels = ['public', 'community', 'private'] as const;
const legacyGeoSharingPrecisions = [
    'exact',
    'neighborhood',
    'city',
    'hidden',
] as const;

export const canonicalizePrivacyLevel = (value: unknown): PrivacyLevel => {
    if (value === 'public' || value === 'authenticated' || value === 'hidden') return value;
    if (value === 'community') return 'authenticated';
    return 'hidden';
};

export const canonicalizeGeoSharingPrecision = (
    value: unknown,
    enabled = true,
): GeoSharingPrecision => {
    if (!enabled || value === 'hidden') return 'hidden';
    return 'approximate';
};

export const privacyExposurePreview = (
    audience: PrivacyLevel,
    location: GeoSharingPrecision,
): string => {
    const audienceText = audience === 'public'
        ? 'Visible to anyone'
        : audience === 'authenticated'
          ? 'Visible only to signed-in participants'
          : 'Hidden from discovery';
    return `${audienceText}. Location: ${location === 'approximate' ? 'approximate area only' : 'hidden'}.`;
};

export const accountActions = ['deactivate', 'export', 'delete'] as const;
export type AccountAction = (typeof accountActions)[number];

// ---------------------------------------------------------------------------
// Contact preferences
// ---------------------------------------------------------------------------

export interface ContactPreferences {
    allowDirectMessages: boolean;
    showEmail: boolean;
    showPhone: boolean;
}

export const contactPreferencesSchema = z.object({
    allowDirectMessages: z.boolean(),
    showEmail: z.boolean(),
    showPhone: z.boolean(),
});

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export interface NotificationPreferences {
    aidRequestUpdates: boolean;
    chatMessages: boolean;
    volunteerMatches: boolean;
    systemAnnouncements: boolean;
}

export const notificationPreferencesSchema = z.object({
    aidRequestUpdates: z.boolean(),
    chatMessages: z.boolean(),
    volunteerMatches: z.boolean(),
    systemAnnouncements: z.boolean(),
});

// ---------------------------------------------------------------------------
// User settings
// ---------------------------------------------------------------------------

export interface UserSettings {
    privacyLevel: PrivacyLevel;
    locationVisibility: GeoSharingPrecision;
    contactPreferences: ContactPreferences;
    notificationPreferences: NotificationPreferences;
}

const canonicalUserSettingsSchema = z.object({
    privacyLevel: z.enum(privacyLevels),
    locationVisibility: z.enum(geoSharingPrecisions),
    contactPreferences: contactPreferencesSchema,
    notificationPreferences: notificationPreferencesSchema,
});

const legacyUserSettingsSchema = z.object({
    privacyLevel: z.enum(legacyPrivacyLevels),
    geoSharingEnabled: z.boolean(),
    geoSharingPrecision: z.enum(legacyGeoSharingPrecisions),
    contactPreferences: contactPreferencesSchema,
    notificationPreferences: notificationPreferencesSchema,
});

/** Accept legacy settings for one release but always return canonical values. */
export const userSettingsSchema = z.union([
    canonicalUserSettingsSchema,
    legacyUserSettingsSchema,
]).transform((settings): UserSettings => {
    if ('locationVisibility' in settings) return settings;
    return {
        privacyLevel: canonicalizePrivacyLevel(settings.privacyLevel),
        locationVisibility: canonicalizeGeoSharingPrecision(
            settings.geoSharingPrecision,
            settings.geoSharingEnabled,
        ),
        contactPreferences: settings.contactPreferences,
        notificationPreferences: settings.notificationPreferences,
    };
});

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export interface SettingsChangeAudit {
    field: string;
    oldValue: unknown;
    newValue: unknown;
    timestamp: string;
    actor: string;
}

export const settingsChangeAuditSchema = z.object({
    field: z.string().min(1),
    oldValue: z.unknown(),
    newValue: z.unknown(),
    timestamp: z.string().datetime({ offset: true }),
    actor: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Account action request
// ---------------------------------------------------------------------------

export interface AccountActionRequest {
    action: AccountAction;
    reason?: string;
    confirmationToken?: string;
}

export const accountActionRequestSchema = z.object({
    action: z.enum(accountActions),
    reason: z.string().optional(),
    confirmationToken: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const defaultUserSettings: UserSettings = {
    privacyLevel: 'authenticated',
    locationVisibility: 'approximate',
    contactPreferences: {
        allowDirectMessages: true,
        showEmail: false,
        showPhone: false,
    },
    notificationPreferences: {
        aidRequestUpdates: true,
        chatMessages: true,
        volunteerMatches: true,
        systemAnnouncements: true,
    },
};

// ---------------------------------------------------------------------------
// Diff helper -- computes audit entries for changed fields
// ---------------------------------------------------------------------------

export const diffSettings = (
    previous: UserSettings,
    next: UserSettings,
    actor: string,
    now: string,
): SettingsChangeAudit[] => {
    const audits: SettingsChangeAudit[] = [];

    const flattenValue = (obj: unknown, prefix: string): Record<string, unknown> => {
        const result: Record<string, unknown> = {};
        if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
            for (const [key, value] of Object.entries(obj)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    Object.assign(result, flattenValue(value, fullKey));
                } else {
                    result[fullKey] = value;
                }
            }
        } else {
            result[prefix] = obj;
        }
        return result;
    };

    const prevFlat = flattenValue(previous, '');
    const nextFlat = flattenValue(next, '');

    const allKeys = new Set([...Object.keys(prevFlat), ...Object.keys(nextFlat)]);

    for (const key of allKeys) {
        const oldVal = prevFlat[key];
        const newVal = nextFlat[key];
        if (oldVal !== newVal) {
            audits.push({
                field: key,
                oldValue: oldVal,
                newValue: newVal,
                timestamp: now,
                actor,
            });
        }
    }

    return audits;
};
