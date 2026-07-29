import { z } from 'zod';

export const CURRENT_POLICY_VERSION = '2026-07-28';

export const requiredPolicyDocuments = [
    'terms-of-use',
    'privacy-notice',
    'community-guidelines',
    'synthetic-data-disclosure',
    'location-sharing-consent',
] as const;

export const accountPreferenceSchema = z
    .object({
        privacy: z.enum(['public', 'community', 'private']),
        notifications: z
            .object({
                inApp: z.boolean(),
                email: z.boolean(),
                push: z.boolean(),
            })
            .strict(),
        visibility: z.enum(['public', 'authenticated', 'hidden']),
        language: z.enum(['en', 'es']),
        location: z
            .object({
                sharing: z.enum(['approximate', 'hidden']),
                noPermanentAddress: z.boolean(),
            })
            .strict(),
    })
    .strict();

export type AccountPreferences = z.infer<typeof accountPreferenceSchema>;

export const defaultAccountPreferences: AccountPreferences = {
    privacy: 'community',
    notifications: {
        inApp: true,
        email: true,
        push: false,
    },
    visibility: 'authenticated',
    language: 'en',
    location: {
        sharing: 'approximate',
        noPermanentAddress: false,
    },
};

export const acceptPolicyConsentSchema = z
    .object({
        policyVersion: z.literal(CURRENT_POLICY_VERSION),
        asserted18OrOlder: z.literal(true),
        acceptedDocuments: z
            .array(z.enum(requiredPolicyDocuments))
            .length(requiredPolicyDocuments.length)
            .refine(
                value =>
                    requiredPolicyDocuments.every(document =>
                        value.includes(document),
                    ),
                'Every required policy document must be accepted.',
            ),
    })
    .strict();

export type AcceptPolicyConsent = z.infer<
    typeof acceptPolicyConsentSchema
>;
