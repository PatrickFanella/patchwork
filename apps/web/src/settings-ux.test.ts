import { describe, expect, it } from 'vitest';
import { defaultUserSettings, type UserSettings } from '@patchwork/shared';
import {
    applySettingsPatch,
    defaultSettingsViewModel,
    isSettingsDirty,
    legalPolicyLinks,
    settingsSectionLabels,
    settingsSections,
    validateSettings,
} from './settings-ux.js';

describe('settings UX module', () => {
    describe('applySettingsPatch', () => {
        it('patches privacy level', () => {
            const next = applySettingsPatch(defaultUserSettings, {
                section: 'privacy',
                field: 'privacyLevel',
                value: 'private',
            });
            expect(next.privacyLevel).toBe('private');
        });

        it('patches geo-sharing enabled', () => {
            const next = applySettingsPatch(defaultUserSettings, {
                section: 'privacy',
                field: 'geoSharingEnabled',
                value: false,
            });
            expect(next.geoSharingEnabled).toBe(false);
        });

        it('patches geo-sharing precision', () => {
            const next = applySettingsPatch(defaultUserSettings, {
                section: 'privacy',
                field: 'geoSharingPrecision',
                value: 'city',
            });
            expect(next.geoSharingPrecision).toBe('city');
        });

        it('patches contact preferences', () => {
            const next = applySettingsPatch(defaultUserSettings, {
                section: 'contact',
                field: 'showEmail',
                value: true,
            });
            expect(next.contactPreferences.showEmail).toBe(true);
            // Other contact fields remain unchanged
            expect(next.contactPreferences.allowDirectMessages).toBe(true);
        });

        it('patches notification preferences', () => {
            const next = applySettingsPatch(defaultUserSettings, {
                section: 'notifications',
                field: 'chatMessages',
                value: false,
            });
            expect(next.notificationPreferences.chatMessages).toBe(false);
            // Other notification fields remain unchanged
            expect(next.notificationPreferences.aidRequestUpdates).toBe(true);
        });

        it('does not mutate the original settings', () => {
            const original = { ...defaultUserSettings };
            applySettingsPatch(original, {
                section: 'privacy',
                field: 'privacyLevel',
                value: 'private',
            });
            expect(original.privacyLevel).toBe('community');
        });
    });

    describe('validateSettings', () => {
        it('passes for valid default settings', () => {
            const result = validateSettings(defaultUserSettings);
            expect(result.ok).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('passes for custom valid settings', () => {
            const settings: UserSettings = {
                privacyLevel: 'public',
                geoSharingEnabled: false,
                geoSharingPrecision: 'hidden',
                contactPreferences: {
                    allowDirectMessages: false,
                    showEmail: false,
                    showPhone: false,
                },
                notificationPreferences: {
                    aidRequestUpdates: false,
                    chatMessages: false,
                    volunteerMatches: false,
                    systemAnnouncements: false,
                },
            };
            const result = validateSettings(settings);
            expect(result.ok).toBe(true);
        });

        it('fails for invalid privacy level', () => {
            const settings = {
                ...defaultUserSettings,
                privacyLevel: 'invisible' as never,
            };
            const result = validateSettings(settings);
            expect(result.ok).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('isSettingsDirty', () => {
        it('returns false when settings are identical', () => {
            expect(
                isSettingsDirty(defaultUserSettings, defaultUserSettings),
            ).toBe(false);
        });

        it('returns true when a field differs', () => {
            const modified: UserSettings = {
                ...defaultUserSettings,
                privacyLevel: 'private',
            };
            expect(isSettingsDirty(modified, defaultUserSettings)).toBe(true);
        });

        it('returns true when a nested field differs', () => {
            const modified: UserSettings = {
                ...defaultUserSettings,
                contactPreferences: {
                    ...defaultUserSettings.contactPreferences,
                    showEmail: true,
                },
            };
            expect(isSettingsDirty(modified, defaultUserSettings)).toBe(true);
        });
    });

    describe('settingsSections', () => {
        it('contains all five sections including legal', () => {
            expect(settingsSections).toEqual([
                'privacy',
                'contact',
                'notifications',
                'account',
                'legal',
            ]);
        });

        it('has labels for all sections', () => {
            for (const section of settingsSections) {
                expect(settingsSectionLabels[section]).toBeDefined();
                expect(settingsSectionLabels[section].length).toBeGreaterThan(0);
            }
        });
    });

    describe('legalPolicyLinks', () => {
        it('contains links for terms, privacy, and community guidelines', () => {
            expect(legalPolicyLinks).toHaveLength(3);
            const routes = legalPolicyLinks.map(link => link.route);
            expect(routes).toContain('/legal/terms');
            expect(routes).toContain('/legal/privacy');
            expect(routes).toContain('/legal/community-guidelines');
        });

        it('has label, route, and description for each link', () => {
            for (const link of legalPolicyLinks) {
                expect(link.label.length).toBeGreaterThan(0);
                expect(link.route).toMatch(/^\/legal\//);
                expect(link.description.length).toBeGreaterThan(0);
            }
        });
    });

    describe('defaultSettingsViewModel', () => {
        it('starts with default user settings', () => {
            expect(defaultSettingsViewModel.settings).toEqual(
                defaultUserSettings,
            );
        });

        it('starts in privacy section', () => {
            expect(defaultSettingsViewModel.activeSection).toBe('privacy');
        });

        it('starts with no dirty state', () => {
            expect(defaultSettingsViewModel.isDirty).toBe(false);
        });
    });
});
