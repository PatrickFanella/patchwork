import type { Pool } from 'pg';
import {
    volunteerPrivateProfileSchema,
    type VolunteerPrivateProfile,
    type VolunteerPrivateProfileStore,
} from '../records/volunteer-profile-command-service.js';

export class PostgresVolunteerPrivateProfileStore
    implements VolunteerPrivateProfileStore
{
    constructor(private readonly pool: Pool) {}

    async get(did: string): Promise<VolunteerPrivateProfile | null> {
        const result = await this.pool.query<{
            contact_email: string | null;
            contact_phone: string | null;
            availability_windows: string[];
            matching_preferences: VolunteerPrivateProfile['matchingPreferences'];
        }>(
            `SELECT contact_email, contact_phone, availability_windows,
                    matching_preferences
             FROM volunteer_private_profiles WHERE did = $1`,
            [did],
        );
        const row = result.rows[0];
        return row ?
                volunteerPrivateProfileSchema.parse({
                    contactEmail: row.contact_email,
                    contactPhone: row.contact_phone,
                    availabilityWindows: row.availability_windows,
                    matchingPreferences: row.matching_preferences,
                })
            :   null;
    }

    async put(
        did: string,
        profile: VolunteerPrivateProfile,
        now = new Date(),
    ): Promise<void> {
        const value = volunteerPrivateProfileSchema.parse(profile);
        await this.pool.query(
            `INSERT INTO volunteer_private_profiles (
                did, contact_email, contact_phone, availability_windows,
                matching_preferences, created_at, updated_at
             ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6)
             ON CONFLICT (did) DO UPDATE SET
                contact_email = EXCLUDED.contact_email,
                contact_phone = EXCLUDED.contact_phone,
                availability_windows = EXCLUDED.availability_windows,
                matching_preferences = EXCLUDED.matching_preferences,
                updated_at = EXCLUDED.updated_at`,
            [
                did,
                value.contactEmail,
                value.contactPhone,
                JSON.stringify(value.availabilityWindows),
                JSON.stringify(value.matchingPreferences),
                now.toISOString(),
            ],
        );
    }

    async delete(did: string): Promise<void> {
        await this.pool.query(
            'DELETE FROM volunteer_private_profiles WHERE did = $1',
            [did],
        );
    }
}
