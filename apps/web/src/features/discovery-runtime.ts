import type { FeedAidCard } from '../feed-ux';

export interface FeedRecordEnvelope {
    aidPostUri: string;
    recipientDid: string;
    cid?: string;
    card: FeedAidCard;
}

export const defaultDiscoveryCenter = {
    lat: 40.7128,
    lng: -74.006,
} as const;
