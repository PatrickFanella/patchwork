import { createFeedCard, type FeedAidCard } from '../feed-ux';
import type { ResourceDirectoryCard } from '../resource-directory-ux';
import type { VolunteerOnboardingDraft } from '../volunteer-onboarding';

export interface FeedRecordEnvelope {
    aidPostUri: string;
    recipientDid: string;
    card: FeedAidCard;
}

export const defaultDiscoveryCenter = {
    lat: 40.7128,
    lng: -74.006,
} as const;

export const initialFeedRecords: FeedRecordEnvelope[] = [
    {
        aidPostUri: 'at://did:example:resident-1/app.patchwork.aid.post/post-1',
        recipientDid: 'did:example:resident-1',
        card: createFeedCard({
            id: 'post-1',
            title: 'Need groceries before 21:00',
            description:
                'Two households need meal kits and infant formula tonight.',
            category: 'food',
            urgency: 5,
            status: 'open',
            accessibilityTags: ['wheelchair', 'quiet-arrival'],
            updatedAt: '2026-02-28T16:20:00.000Z',
            location: { lat: 40.7134, lng: -74.0049 },
        }),
    },
    {
        aidPostUri: 'at://did:example:resident-2/app.patchwork.aid.post/post-2',
        recipientDid: 'did:example:resident-2',
        card: createFeedCard({
            id: 'post-2',
            title: 'Clinic ride required',
            description:
                'Wheelchair-compatible transport needed for evening appointment.',
            category: 'transport',
            urgency: 4,
            status: 'in-progress',
            accessibilityTags: ['mobility-aid'],
            updatedAt: '2026-02-28T15:42:00.000Z',
            location: { lat: 40.7182, lng: -74.0007 },
        }),
    },
    {
        aidPostUri: 'at://did:example:resident-3/app.patchwork.aid.post/post-3',
        recipientDid: 'did:example:resident-3',
        card: createFeedCard({
            id: 'post-3',
            title: 'Temporary shelter request',
            description:
                'Need safe overnight shelter for one caregiver and child.',
            category: 'shelter',
            urgency: 3,
            status: 'open',
            accessibilityTags: ['child-safe'],
            updatedAt: '2026-02-28T14:55:00.000Z',
            location: { lat: 40.7063, lng: -74.0125 },
        }),
    },
    {
        aidPostUri: 'at://did:example:resident-4/app.patchwork.aid.post/post-4',
        recipientDid: 'did:example:resident-4',
        card: createFeedCard({
            id: 'post-4',
            title: 'Prescription pickup assistance',
            description:
                'Need someone to collect medication and deliver this afternoon.',
            category: 'medical',
            urgency: 2,
            status: 'resolved',
            accessibilityTags: ['language-support'],
            updatedAt: '2026-02-28T12:05:00.000Z',
            location: { lat: 40.7211, lng: -74.0143 },
        }),
    },
];

export const initialResourceCards: ResourceDirectoryCard[] = [
    {
        uri: 'at://did:example:org/app.patchwork.directory.resource/food-01',
        id: 'food-01',
        name: 'Sunrise Food Bank',
        category: 'food-bank',
        location: {
            lat: 40.7142,
            lng: -74.0068,
            precisionMeters: 180,
            areaLabel: 'Lower Manhattan',
        },
        openHours: 'Daily · 09:00–20:00',
        eligibilityNotes: 'Walk-ins accepted, ID optional',
        contact: {
            phone: '+1-555-0110',
        },
    },
    {
        uri: 'at://did:example:org/app.patchwork.directory.resource/clinic-01',
        id: 'clinic-01',
        name: 'Neighborhood Clinic',
        category: 'clinic',
        location: {
            lat: 40.7191,
            lng: -74.0021,
            precisionMeters: 220,
            areaLabel: 'Civic East',
        },
        openHours: 'Mon–Sat · 10:00–18:00',
        eligibilityNotes: 'Urgent triage available',
        contact: {
            phone: '+1-555-0191',
            url: 'https://example.org/clinic',
        },
    },
    {
        uri: 'at://did:example:org/app.patchwork.directory.resource/shelter-01',
        id: 'shelter-01',
        name: 'Harbor Safe Shelter',
        category: 'shelter',
        location: {
            lat: 40.7082,
            lng: -74.0119,
            precisionMeters: 260,
            areaLabel: 'Waterfront South',
        },
        openHours: '24/7 emergency intake',
        eligibilityNotes: 'Family-safe beds and quiet rooms available',
        contact: {
            phone: '+1-555-0133',
        },
    },
    {
        uri: 'at://did:example:org/app.patchwork.directory.resource/legal-01',
        id: 'legal-01',
        name: 'Community Legal Aid Desk',
        category: 'legal-aid',
        location: {
            lat: 40.723,
            lng: -74.0086,
            precisionMeters: 320,
            areaLabel: 'Civic Quarter',
        },
        openHours: 'Tue–Fri · 13:00–19:00',
        eligibilityNotes: 'Tenancy and benefits guidance',
        contact: {
            url: 'https://example.org/legal-aid',
        },
    },
];

export const defaultVolunteerDraft: VolunteerOnboardingDraft = {
    did: 'did:example:helper001',
    displayName: 'Ari',
    capabilities: ['transport', 'food-delivery'],
    availability: 'within-24h',
    contactPreference: 'chat-or-call',
    skills: ['First aid', 'Meal delivery'],
    availabilityWindows: ['weekday_evenings', 'weekend_mornings'],
    preferredCategories: ['medical', 'food'],
    preferredUrgencies: ['high', 'critical'],
    maxDistanceKm: 15,
    acceptsLateNight: true,
    checkpoints: {
        identityCheck: 'approved',
        safetyTraining: 'approved',
        communityReference: 'pending',
    },
    notes: 'Comfortable with intake triage and multilingual support.',
};
