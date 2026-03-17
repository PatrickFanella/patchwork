import { describe, expect, it } from 'vitest';
import {
    defaultUserSettings,
    diffSettings,
    userSettingsSchema,
    accountActionRequestSchema,
    settingsChangeAuditSchema,
    type UserSettings,
} from './settings.js';

describe('settings types and validation', () => {
    it('validates the default user settings', () => {
        const result = userSettingsSchema.safeParse(defaultUserSettings);
        expect(result.success).toBe(true);
    });

    it('rejects settings with an invalid privacy level', () => {
        const invalid = {
            ...defaultUserSettings,
            privacyLevel: 'invisible',
        };
        const result = userSettingsSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('rejects settings with an invalid geo-sharing precision', () => {
        const invalid = {
            ...defaultUserSettings,
            geoSharingPrecision: 'block-level',
        };
        const result = userSettingsSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('rejects settings with missing contact preferences fields', () => {
        const invalid = {
            ...defaultUserSettings,
            contactPreferences: { allowDirectMessages: true },
        };
        const result = userSettingsSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('rejects settings with missing notification preferences fields', () => {
        const invalid = {
            ...defaultUserSettings,
            notificationPreferences: { chatMessages: true },
        };
        const result = userSettingsSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('validates a complete settings object with all fields', () => {
        const settings: UserSettings = {
            privacyLevel: 'private',
            geoSharingEnabled: false,
            geoSharingPrecision: 'city',
            contactPreferences: {
                allowDirectMessages: false,
                showEmail: false,
                showPhone: false,
            },
            notificationPreferences: {
                aidRequestUpdates: false,
                chatMessages: false,
                volunteerMatches: false,
                systemAnnouncements: true,
            },
        };
        const result = userSettingsSchema.safeParse(settings);
        expect(result.success).toBe(true);
    });

    it('validates an account action request', () => {
        const valid = { action: 'export', reason: 'GDPR request' };
        const result = accountActionRequestSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });

    it('rejects an invalid account action', () => {
        const invalid = { action: 'purge' };
        const result = accountActionRequestSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('validates a settings change audit entry', () => {
        const entry = {
            field: 'privacyLevel',
            oldValue: 'public',
            newValue: 'private',
            timestamp: '2026-03-01T12:00:00.000Z',
            actor: 'did:example:alice',
        };
        const result = settingsChangeAuditSchema.safeParse(entry);
        expect(result.success).toBe(true);
    });
});

describe('diffSettings', () => {
    it('returns empty array when settings are identical', () => {
        const audits = diffSettings(
            defaultUserSettings,
            defaultUserSettings,
            'did:example:alice',
            '2026-03-01T12:00:00.000Z',
        );
        expect(audits).toHaveLength(0);
    });

    it('detects a single top-level change', () => {
        const next: UserSettings = {
            ...defaultUserSettings,
            privacyLevel: 'private',
        };
        const audits = diffSettings(
            defaultUserSettings,
            next,
            'did:example:alice',
            '2026-03-01T12:00:00.000Z',
        );
        expect(audits).toHaveLength(1);
        expect(audits[0]?.field).toBe('privacyLevel');
        expect(audits[0]?.oldValue).toBe('community');
        expect(audits[0]?.newValue).toBe('private');
        expect(audits[0]?.actor).toBe('did:example:alice');
    });

    it('detects nested contact preferences changes', () => {
        const next: UserSettings = {
            ...defaultUserSettings,
            contactPreferences: {
                ...defaultUserSettings.contactPreferences,
                showEmail: true,
                showPhone: true,
            },
        };
        const audits = diffSettings(
            defaultUserSettings,
            next,
            'did:example:bob',
            '2026-03-01T13:00:00.000Z',
        );
        expect(audits.length).toBeGreaterThanOrEqual(2);

        const emailChange = audits.find(a =>
            a.field.includes('showEmail'),
        );
        expect(emailChange).toBeDefined();
        expect(emailChange?.oldValue).toBe(false);
        expect(emailChange?.newValue).toBe(true);
    });

    it('detects multiple changes across sections', () => {
        const next: UserSettings = {
            privacyLevel: 'private',
            geoSharingEnabled: false,
            geoSharingPrecision: 'hidden',
            contactPreferences: {
                allowDirectMessages: false,
                showEmail: true,
                showPhone: false,
            },
            notificationPreferences: {
                aidRequestUpdates: false,
                chatMessages: false,
                volunteerMatches: false,
                systemAnnouncements: false,
            },
        };
        const audits = diffSettings(
            defaultUserSettings,
            next,
            'did:example:charlie',
            '2026-03-01T14:00:00.000Z',
        );
        // privacy: privacyLevel, geoSharingEnabled, geoSharingPrecision changed
        // contact: allowDirectMessages, showEmail changed
        // notifications: aidRequestUpdates, chatMessages, volunteerMatches, systemAnnouncements changed
        expect(audits.length).toBeGreaterThanOrEqual(7);
    });
});
