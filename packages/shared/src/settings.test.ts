import { describe, expect, it } from 'vitest';
import {
    defaultUserSettings,
    privacyExposurePreview,
    userSettingsSchema,
} from './settings.js';

describe('privacy settings migration', () => {
    it('accepts the legacy audience and geo fields but emits canonical values', () => {
        const parsed = userSettingsSchema.parse({
            ...defaultUserSettings,
            privacyLevel: 'community',
            geoSharingEnabled: true,
            geoSharingPrecision: 'city',
        });

        expect(parsed).toMatchObject({
            privacyLevel: 'authenticated',
            locationVisibility: 'approximate',
        });
        expect(parsed).not.toHaveProperty('geoSharingEnabled');
        expect(parsed).not.toHaveProperty('geoSharingPrecision');
    });

    it('maps legacy private and disabled sharing to hidden values', () => {
        const parsed = userSettingsSchema.parse({
            ...defaultUserSettings,
            privacyLevel: 'private',
            geoSharingEnabled: false,
            geoSharingPrecision: 'exact',
        });

        expect(parsed).toMatchObject({
            privacyLevel: 'hidden',
            locationVisibility: 'hidden',
        });
    });

    it('makes the audience and location exposure independently visible', () => {
        expect(
            privacyExposurePreview('authenticated', 'approximate'),
        ).toContain('signed-in participants');
        expect(privacyExposurePreview('hidden', 'hidden')).toContain(
            'Location: hidden',
        );
    });
});
