import { describe, expect, it } from 'vitest';
import { defaultDiscoveryFilterState } from './discovery-filters.js';
import {
    applyFeedLifecycleAction,
    buildFeedViewModel,
    createFeedCard,
    type FeedAidCard,
} from './feed-ux.js';

const sampleCards = (): FeedAidCard[] => [
    createFeedCard({
        id: 'a',
        title: 'Need groceries',
        description: 'Family support needed',
        category: 'food',
        urgency: 4,
        status: 'open',
        updatedAt: '2026-02-26T10:00:00.000Z',
        location: { lat: 1.3001, lng: 103.8001 },
    }),
    createFeedCard({
        id: 'b',
        title: 'Need ride to clinic',
        description: 'Transport request',
        category: 'medical',
        urgency: 5,
        status: 'in-progress',
        updatedAt: '2026-02-26T11:00:00.000Z',
        location: { lat: 1.35, lng: 103.85 },
    }),
];

describe('feed ux', () => {
    it('builds latest feed view sorted by recency', () => {
        const view = buildFeedViewModel(sampleCards(), {
            ...defaultDiscoveryFilterState,
            status: undefined,
        });

        expect(view.cards.map(card => card.id)).toEqual(['b', 'a']);
        expect(view.presentations[0]?.statusBadge.label).toBe('In progress');
    });

    it('filters nearby tab by center/radius', () => {
        const state = {
            ...defaultDiscoveryFilterState,
            feedTab: 'nearby' as const,
            center: { lat: 1.3, lng: 103.8 },
            radiusMeters: 3000,
        };

        const view = buildFeedViewModel(sampleCards(), state);
        expect(view.cards.map(card => card.id)).toEqual(['a']);
    });

    it('supports lifecycle create/edit/close actions', () => {
        const createdCard = createFeedCard({
            id: 'new',
            title: 'Need shelter',
            description: 'Temporary shelter needed',
            category: 'shelter',
            urgency: 3,
        });

        const created = applyFeedLifecycleAction(sampleCards(), {
            action: 'create',
            card: createdCard,
        });
        expect(created[0]?.id).toBe('new');

        const edited = applyFeedLifecycleAction(created, {
            action: 'edit',
            id: 'new',
            patch: { title: 'Need urgent shelter', urgency: 5 },
        });
        const editedCard = edited.find(card => card.id === 'new');
        expect(editedCard?.title).toBe('Need urgent shelter');
        expect(editedCard?.urgency).toBe(5);

        const closed = applyFeedLifecycleAction(edited, {
            action: 'close',
            id: 'new',
            closedAt: '2026-02-26T12:30:00.000Z',
        });
        const closedCard = closed.find(card => card.id === 'new');
        expect(closedCard?.status).toBe('closed');
        expect(closedCard?.updatedAt).toBe('2026-02-26T12:30:00.000Z');
    });
});
