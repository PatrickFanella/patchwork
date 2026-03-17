import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const privacyLevels = ['public', 'community', 'private'] as const;
export type PrivacyLevel = (typeof privacyLevels)[number];

export const geoSharingPrecisions = [
    'exact',
    'neighborhood',
    'city',
    'hidden',
] as const;
export type GeoSharingPrecision = (typeof geoSharingPrecisions)[number];

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
    geoSharingEnabled: boolean;
    geoSharingPrecision: GeoSharingPrecision;
    contactPreferences: ContactPreferences;
    notificationPreferences: NotificationPreferences;
}

export const userSettingsSchema = z.object({
    privacyLevel: z.enum(privacyLevels),
    geoSharingEnabled: z.boolean(),
    geoSharingPrecision: z.enum(geoSharingPrecisions),
    contactPreferences: contactPreferencesSchema,
    notificationPreferences: notificationPreferencesSchema,
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
    privacyLevel: 'community',
    geoSharingEnabled: true,
    geoSharingPrecision: 'neighborhood',
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
