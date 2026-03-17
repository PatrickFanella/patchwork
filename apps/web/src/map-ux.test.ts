import { describe, expect, it } from 'vitest';
import { defaultDiscoveryFilterState } from './discovery-filters.js';
import {
    buildMapViewModel,
    clusterMapCards,
    filterMapCards,
    openMapDetailDrawer,
    toApproximateMapMarker,
    type MapAidCard,
} from './map-ux.js';

const buildCard = (overrides: Partial<MapAidCard>): MapAidCard => ({
    id: overrides.id ?? 'card-1',
    title: overrides.title ?? 'Need water',
    summary: overrides.summary ?? 'Need support in my area',
    category: overrides.category ?? 'food',
    status: overrides.status ?? 'open',
    urgency: overrides.urgency ?? 3,
    updatedAt: overrides.updatedAt ?? '2026-02-26T10:00:00.000Z',
    location: overrides.location,
});

describe('map ux', () => {
    it('clusters nearby cards in a single grid cell', () => {
        const cards = [
            buildCard({
                id: 'near-1',
                location: { lat: 1.3, lng: 103.8, precisionMeters: 300 },
            }),
            buildCard({
                id: 'near-2',
                location: { lat: 1.3002, lng: 103.8002, precisionMeters: 300 },
            }),
        ];

        const clusters = clusterMapCards(cards, 1000);

        expect(clusters).toHaveLength(1);
        expect(clusters[0]?.count).toBe(2);
        expect(clusters[0]?.status).toBe('open');
    });

    it('filters cards by category and radius interactions', () => {
        const cards = [
            buildCard({
                id: 'in-radius',
                category: 'food',
                location: { lat: 1.3, lng: 103.8, precisionMeters: 500 },
            }),
            buildCard({
                id: 'out-radius',
                category: 'food',
                location: { lat: 1.35, lng: 103.85, precisionMeters: 500 },
            }),
            buildCard({
                id: 'wrong-category',
                category: 'medical',
                location: { lat: 1.3001, lng: 103.8001, precisionMeters: 500 },
            }),
        ];

        const filtered = filterMapCards(cards, {
            ...defaultDiscoveryFilterState,
            category: 'food',
            center: { lat: 1.3, lng: 103.8 },
            radiusMeters: 2500,
        });

        expect(filtered.map(card => card.id)).toEqual(['in-radius']);
    });

    it('enforces approximate-area marker precision floor', () => {
        const marker = toApproximateMapMarker(
            buildCard({
                id: 'approx-1',
                category: 'transport',
                location: {
                    lat: 1.30019,
                    lng: 103.80019,
                    precisionMeters: 120,
                    areaLabel: 'Downtown West',
                },
            }),
        );

        expect(marker?.radiusMeters).toBeGreaterThanOrEqual(300);
        expect(marker?.label).toBe('Downtown West');
    });

    it('opens detail drawer with contact-helper CTA and triage actions', () => {
        const cards = [
            buildCard({
                id: 'drawer-1',
                title: 'Need water',
                status: 'open',
                location: { lat: 1.3, lng: 103.8, precisionMeters: 300 },
            }),
        ];

        const viewModel = buildMapViewModel(cards, defaultDiscoveryFilterState);
        const drawer = openMapDetailDrawer(viewModel.filteredCards, 'drawer-1');

        expect(drawer.open).toBe(true);
        expect(drawer.primaryCtaLabel).toBe('Contact helper');
        expect(drawer.primaryCtaAriaLabel).toContain('Need water');
        expect(
            drawer.actions.some(action => action.action === 'contact_helper'),
        ).toBe(true);
    });
});
