import { createHash } from 'node:crypto';
import {
    volunteerProfileSchema,
    type VolunteerProfileRecord,
} from '@patchwork/at-lexicons';
import type { VolunteerProfileRecordResult } from '@patchwork/at-client';
import { z } from 'zod';
import type { PublicSubmissionSafetyGate } from '../public-submission-safety.js';
import { PublicHttpError } from '../http/error-response.js';

const volunteerUriSchema = z
    .string()
    .regex(
        /^at:\/\/did:[^/]+\/app\.patchwork\.volunteer\.profile\/[^/]+$/,
    );

const serviceAreaSchema = volunteerProfileSchema.shape.serviceArea.unwrap();
const publicInputSchema = z
    .object({
        displayName: volunteerProfileSchema.shape.displayName,
        bio: volunteerProfileSchema.shape.bio,
        capabilities: volunteerProfileSchema.shape.capabilities,
        availability: volunteerProfileSchema.shape.availability,
        contactPreference: volunteerProfileSchema.shape.contactPreference,
        skills: volunteerProfileSchema.shape.skills,
        languages: volunteerProfileSchema.shape.languages,
        serviceArea: serviceAreaSchema.optional(),
    })
    .strict();

export const volunteerPrivateProfileSchema = z
    .object({
        contactEmail: z.string().email().max(254).nullable(),
        contactPhone: z.string().min(3).max(40).nullable(),
        availabilityWindows: z.array(z.string().min(1).max(64)).max(50),
        matchingPreferences: z
            .object({
                preferredCategories:
                    volunteerProfileSchema.shape.matchingPreferences
                        .unwrap().shape.preferredCategories,
                preferredUrgencies:
                    volunteerProfileSchema.shape.matchingPreferences
                        .unwrap().shape.preferredUrgencies,
                maxDistanceKm:
                    volunteerProfileSchema.shape.matchingPreferences
                        .unwrap().shape.maxDistanceKm,
                acceptsLateNight: z.boolean(),
            })
            .strict(),
    })
    .strict();

export type VolunteerPrivateProfile = z.infer<
    typeof volunteerPrivateProfileSchema
>;

export interface VolunteerProfileClient {
    create(
        record: unknown,
        rkey?: string,
    ): Promise<VolunteerProfileRecordResult>;
    get(uri: string): Promise<VolunteerProfileRecordResult>;
    update(
        uri: string,
        expectedCid: string,
        record: unknown,
    ): Promise<VolunteerProfileRecordResult>;
    delete(uri: string, expectedCid: string): Promise<void>;
}

export interface VolunteerPrivateProfileStore {
    get(did: string): Promise<VolunteerPrivateProfile | null>;
    put(did: string, profile: VolunteerPrivateProfile): Promise<void>;
    delete(did: string): Promise<void>;
}

export type VolunteerProfileClientFactory = (
    sessionToken: string,
) => Promise<VolunteerProfileClient>;

const createCommandSchema = z
    .object({
        profile: publicInputSchema,
        privateProfile: volunteerPrivateProfileSchema,
    })
    .strict();

const updateCommandSchema = createCommandSchema
    .extend({
        uri: volunteerUriSchema,
        expectedCid: z.string().min(1),
    })
    .strict();

const deleteCommandSchema = z
    .object({
        uri: volunteerUriSchema,
        expectedCid: z.string().min(1),
    })
    .strict();

export class VolunteerProfileCommandService {
    constructor(
        private readonly clientFactory: VolunteerProfileClientFactory,
        private readonly privateStore: VolunteerPrivateProfileStore,
        private readonly safetyGate?: PublicSubmissionSafetyGate,
    ) {}

    async create(
        sessionToken: string,
        ownerDid: string,
        input: unknown,
        idempotencyKey: string,
        now = new Date(),
    ): Promise<
        VolunteerProfileRecordResult & {
            privateProfile: VolunteerPrivateProfile;
        }
    > {
        const command = createCommandSchema.parse(input);
        const record: VolunteerProfileRecord = {
            $type: 'app.patchwork.volunteer.profile',
            version: '1.2.0',
            ...command.profile,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
        };
        const client = await this.clientFactory(sessionToken);
        const rkey = `pw${createHash('sha256')
            .update(idempotencyKey)
            .digest('hex')
            .slice(0, 22)}`;
        if (this.safetyGate) {
            await this.safetyGate.review({
                actorDid: ownerDid,
                subjectUri:
                    `at://${ownerDid}/app.patchwork.volunteer.profile/${rkey}`,
                submissionType: 'volunteer-profile',
                operation: 'create',
                record: record as unknown as Record<string, unknown>,
                idempotencyKey:
                    `volunteer-profile:create:${idempotencyKey}`,
            });
        }
        const result = await client.create(record, rkey);
        await this.privateStore.put(ownerDid, command.privateProfile);
        return { ...result, privateProfile: command.privateProfile };
    }

    async get(
        sessionToken: string,
        ownerDid: string,
        uri: string,
    ): Promise<
        VolunteerProfileRecordResult & {
            privateProfile: VolunteerPrivateProfile | null;
        }
    > {
        const client = await this.clientFactory(sessionToken);
        const record = await client.get(volunteerUriSchema.parse(uri));
        return {
            ...record,
            privateProfile: await this.privateStore.get(ownerDid),
        };
    }

    async update(
        sessionToken: string,
        ownerDid: string,
        input: unknown,
        now = new Date(),
        idempotencyKey?: string,
    ): Promise<
        VolunteerProfileRecordResult & {
            privateProfile: VolunteerPrivateProfile;
        }
    > {
        const command = updateCommandSchema.parse(input);
        const client = await this.clientFactory(sessionToken);
        const current = await client.get(command.uri);
        const record: VolunteerProfileRecord = {
            $type: 'app.patchwork.volunteer.profile',
            version: '1.2.0',
            ...command.profile,
            createdAt: current.record.createdAt,
            updatedAt: now.toISOString(),
        };
        if (this.safetyGate) {
            if (!idempotencyKey) {
                throw new PublicHttpError(
                    503,
                    'SUBMISSION_SAFETY_UNAVAILABLE',
                    'Publication safety checks are unavailable. Nothing was published.',
                );
            }
            await this.safetyGate.review({
                actorDid: ownerDid,
                subjectUri: command.uri,
                submissionType: 'volunteer-profile',
                operation: 'update',
                record: record as unknown as Record<string, unknown>,
                idempotencyKey:
                    `volunteer-profile:update:${idempotencyKey}`,
            });
        }
        const result = await client.update(
            command.uri,
            command.expectedCid,
            record,
        );
        await this.privateStore.put(ownerDid, command.privateProfile);
        return { ...result, privateProfile: command.privateProfile };
    }

    async delete(
        sessionToken: string,
        ownerDid: string,
        input: unknown,
    ): Promise<void> {
        const command = deleteCommandSchema.parse(input);
        const client = await this.clientFactory(sessionToken);
        await client.delete(command.uri, command.expectedCid);
        await this.privateStore.delete(ownerDid);
    }
}
