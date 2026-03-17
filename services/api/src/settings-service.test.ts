import { describe, expect, it } from 'vitest';
import { defaultUserSettings, type UserSettings } from '@patchwork/shared';
import { createFixtureSettingsService } from './settings-service.js';

describe('ApiSettingsService', () => {
    describe('GET /account/settings', () => {
        it('returns default settings for a new DID', () => {
            const service = createFixtureSettingsService();
            const result = service.getSettings(
                new URLSearchParams({ did: 'did:example:alice' }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                did: string;
                settings: UserSettings;
            };
            expect(body.did).toBe('did:example:alice');
            expect(body.settings.privacyLevel).toBe(
                defaultUserSettings.privacyLevel,
            );
        });

        it('returns 400 when DID is missing', () => {
            const service = createFixtureSettingsService();
            const result = service.getSettings(new URLSearchParams());

            expect(result.statusCode).toBe(400);
        });
    });

    describe('PUT /account/settings', () => {
        it('persists updated settings', () => {
            const service = createFixtureSettingsService();
            const updatedSettings: UserSettings = {
                ...defaultUserSettings,
                privacyLevel: 'private',
                geoSharingPrecision: 'city',
            };

            const updateResult = service.updateSettings({
                did: 'did:example:alice',
                settings: updatedSettings,
            });
            expect(updateResult.statusCode).toBe(200);

            const getResult = service.getSettings(
                new URLSearchParams({ did: 'did:example:alice' }),
            );
            const body = getResult.body as {
                did: string;
                settings: UserSettings;
            };
            expect(body.settings.privacyLevel).toBe('private');
            expect(body.settings.geoSharingPrecision).toBe('city');
        });

        it('rejects invalid settings payload', () => {
            const service = createFixtureSettingsService();
            const result = service.updateSettings({
                did: 'did:example:alice',
                settings: { privacyLevel: 'invisible' },
            });
            expect(result.statusCode).toBe(400);
        });

        it('rejects missing DID', () => {
            const service = createFixtureSettingsService();
            const result = service.updateSettings({
                settings: defaultUserSettings,
            });
            expect(result.statusCode).toBe(400);
        });

        it('rejects non-object body', () => {
            const service = createFixtureSettingsService();
            const result = service.updateSettings('not-an-object');
            expect(result.statusCode).toBe(400);
        });

        it('records changes to audit log', () => {
            const service = createFixtureSettingsService();
            const updatedSettings: UserSettings = {
                ...defaultUserSettings,
                privacyLevel: 'private',
            };

            service.updateSettings({
                did: 'did:example:bob',
                settings: updatedSettings,
            });

            const auditLog = service.getAuditLogForTesting();
            expect(auditLog.length).toBeGreaterThan(0);

            const privacyChange = auditLog.find(
                entry => entry.field === 'privacyLevel',
            );
            expect(privacyChange).toBeDefined();
            expect(privacyChange?.oldValue).toBe('community');
            expect(privacyChange?.newValue).toBe('private');
        });

        it('reports changesRecorded count in response', () => {
            const service = createFixtureSettingsService();
            const updatedSettings: UserSettings = {
                ...defaultUserSettings,
                privacyLevel: 'private',
                geoSharingEnabled: false,
            };

            const result = service.updateSettings({
                did: 'did:example:alice',
                settings: updatedSettings,
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as { changesRecorded: number };
            expect(body.changesRecorded).toBeGreaterThanOrEqual(2);
        });
    });

    describe('POST /account/settings/audit', () => {
        it('returns audit entries for a DID', () => {
            const service = createFixtureSettingsService();

            service.updateSettings({
                did: 'did:example:alice',
                settings: {
                    ...defaultUserSettings,
                    privacyLevel: 'private',
                },
            });

            const auditResult = service.getAuditTrail({
                did: 'did:example:alice',
            });
            expect(auditResult.statusCode).toBe(200);

            const body = auditResult.body as {
                entries: unknown[];
                total: number;
            };
            expect(body.total).toBeGreaterThan(0);
            expect(body.entries.length).toBe(body.total);
        });

        it('returns empty entries for DID with no changes', () => {
            const service = createFixtureSettingsService();
            const auditResult = service.getAuditTrail({
                did: 'did:example:new-user',
            });
            expect(auditResult.statusCode).toBe(200);

            const body = auditResult.body as { total: number };
            expect(body.total).toBe(0);
        });

        it('rejects missing DID', () => {
            const service = createFixtureSettingsService();
            const result = service.getAuditTrail({});
            expect(result.statusCode).toBe(400);
        });
    });

    describe('POST /account/deactivate', () => {
        it('initiates deactivation and records audit entry', () => {
            const service = createFixtureSettingsService();
            const result = service.deactivateAccount({
                did: 'did:example:alice',
                reason: 'Taking a break',
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                action: string;
                status: string;
                message: string;
            };
            expect(body.action).toBe('deactivate');
            expect(body.status).toBe('initiated');

            const actions = service.getAccountActionsForTesting();
            expect(actions).toHaveLength(1);
            expect(actions[0]?.action).toBe('deactivate');

            const auditLog = service.getAuditLogForTesting();
            const deactivateEntry = auditLog.find(
                entry => entry.field === 'account.deactivate',
            );
            expect(deactivateEntry).toBeDefined();
        });

        it('rejects missing DID', () => {
            const service = createFixtureSettingsService();
            const result = service.deactivateAccount({});
            expect(result.statusCode).toBe(400);
        });
    });

    describe('POST /account/export', () => {
        it('initiates data export and records audit entry', () => {
            const service = createFixtureSettingsService();
            const result = service.exportAccountData({
                did: 'did:example:alice',
                reason: 'GDPR request',
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                action: string;
                status: string;
                message: string;
            };
            expect(body.action).toBe('export');
            expect(body.status).toBe('initiated');

            const actions = service.getAccountActionsForTesting();
            expect(actions).toHaveLength(1);
            expect(actions[0]?.action).toBe('export');

            const auditLog = service.getAuditLogForTesting();
            const exportEntry = auditLog.find(
                entry => entry.field === 'account.export',
            );
            expect(exportEntry).toBeDefined();
        });

        it('rejects missing DID', () => {
            const service = createFixtureSettingsService();
            const result = service.exportAccountData({});
            expect(result.statusCode).toBe(400);
        });
    });

    describe('settings persistence round-trip', () => {
        it('read-update-read cycle preserves changes', () => {
            const service = createFixtureSettingsService();
            const did = 'did:example:roundtrip';

            // Read defaults
            const initial = service.getSettings(
                new URLSearchParams({ did }),
            );
            const initialBody = initial.body as {
                settings: UserSettings;
            };
            expect(initialBody.settings.privacyLevel).toBe('community');

            // Update
            const updated: UserSettings = {
                ...initialBody.settings,
                privacyLevel: 'public',
                geoSharingPrecision: 'exact',
                contactPreferences: {
                    ...initialBody.settings.contactPreferences,
                    showEmail: true,
                },
            };

            service.updateSettings({ did, settings: updated });

            // Read back
            const final = service.getSettings(
                new URLSearchParams({ did }),
            );
            const finalBody = final.body as {
                settings: UserSettings;
            };
            expect(finalBody.settings.privacyLevel).toBe('public');
            expect(finalBody.settings.geoSharingPrecision).toBe('exact');
            expect(finalBody.settings.contactPreferences.showEmail).toBe(true);
        });
    });
});
