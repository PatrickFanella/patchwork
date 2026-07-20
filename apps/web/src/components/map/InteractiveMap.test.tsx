// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { InteractiveMap } from './InteractiveMap.js';

// Mock matchMedia for reduced motion check
beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
});

const leafletMock = vi.hoisted(() => {
    const remove = vi.fn();
    const circleOn = vi.fn();
    const circle: any = vi.fn(() => circle);
    circle.addTo = vi.fn(() => circle);
    circle.remove = remove;
    circle.on = circleOn;
    circle.bindTooltip = vi.fn(() => circle);
    const getContainer = vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const mapState = {
        getZoom: () => 9,
        getContainer,
        remove,
        attributionControl: { addAttribution: vi.fn() },
        setView: vi.fn(() => mapState),
    };
    const map = vi.fn(() => mapState);
    return { remove, circleOn, circle, map };
});

vi.mock('leaflet', () => ({
    default: {
        map: leafletMock.map,
        circle: leafletMock.circle,
        control: { attribution: vi.fn(() => ({ addTo: vi.fn() })) },
    },
}));

const tileLayer = { on: vi.fn(), addTo: vi.fn() };
vi.mock('protomaps-leaflet', () => ({
    leafletLayer: vi.fn(() => tileLayer),
}));

describe('InteractiveMap', () => {
    afterEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
    });

    it('renders circles without pins and synchronizes selection', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const onSelectPostId = vi.fn();
        await act(async () => {
            root.render(
                <InteractiveMap
                    cards={[{ id: 'card-1', title: 'Need rice', summary: 'Help', category: 'food', status: 'open', urgency: 3, updatedAt: '2026-07-01T00:00:00.000Z', location: { lat: 1.3, lng: 103.8, precisionKm: 1 } }]}
                    clusters={[]}
                    selectedPostId='card-1'
                    center={{ lat: 1.3, lng: 103.8 }}
                    onSelectPostId={onSelectPostId}
                    onTilesFailed={vi.fn()}
                />,
            );
        });

        expect(leafletMock.circle).toHaveBeenCalled();
        expect(leafletMock.map).toHaveBeenCalled();
        expect(tileLayer.addTo).toHaveBeenCalled();
        const circleArgs = (leafletMock.circle.mock.calls as unknown as Array<[unknown, { className?: string }]>)[0]?.[1];
        expect(circleArgs).toMatchObject({ className: 'mh-map-circle is-selected' });
        (leafletMock.circleOn.mock.calls as unknown as Array<[string, () => void]>)[0]?.[1]?.();
        expect(onSelectPostId).toHaveBeenCalledWith('card-1');
        await act(async () => root.unmount());
    });

    it('reports tile failure and clears map ref on cleanup', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const onTilesFailed = vi.fn();

        await act(async () => {
            root.render(
                <InteractiveMap
                    cards={[]}
                    clusters={[]}
                    center={{ lat: 1.3, lng: 103.8 }}
                    onSelectPostId={vi.fn()}
                    onTilesFailed={onTilesFailed}
                />,
            );
        });

        tileLayer.on.mock.calls[0]?.[1]?.(new Event('tileerror'));
        expect(onTilesFailed).toHaveBeenCalled();
        await act(async () => root.unmount());
        expect(leafletMock.remove).toHaveBeenCalled();
    });

    it('shows legend with privacy note and instructions', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <InteractiveMap
                    cards={[{ id: 'card-1', title: 'Need rice', summary: 'Help', category: 'food', status: 'open', urgency: 3, updatedAt: '2026-07-01T00:00:00.000Z', location: { lat: 1.3, lng: 103.8, precisionKm: 1 } }]}
                    clusters={[]}
                    center={{ lat: 1.3, lng: 103.8 }}
                    onSelectPostId={vi.fn()}
                    onTilesFailed={vi.fn()}
                />,
            );
        });

        const legend = document.querySelector('.mh-map-legend');
        expect(legend).not.toBeNull();
        expect(legend?.textContent).toContain('approximate');
        expect(legend?.textContent).toContain('Multiple requests cluster');

        const instructions = document.querySelector('.mh-map-instructions');
        expect(instructions).not.toBeNull();

        await act(async () => root.unmount());
    });

    it('shows empty state message when no cards or clusters', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <InteractiveMap
                    cards={[]}
                    clusters={[]}
                    center={{ lat: 1.3, lng: 103.8 }}
                    onSelectPostId={vi.fn()}
                    onTilesFailed={vi.fn()}
                />,
            );
        });

        const emptyMessage = document.querySelector('.mh-map-empty-message');
        expect(emptyMessage).not.toBeNull();
        expect(emptyMessage?.textContent).toContain('No aid requests');

        await act(async () => root.unmount());
    });

    it('renders cluster circles with distinct styling', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <InteractiveMap
                    cards={[
                        { id: 'card-1', title: 'Need rice', summary: 'Help', category: 'food', status: 'open', urgency: 3, updatedAt: '2026-07-01T00:00:00.000Z', location: { lat: 1.3, lng: 103.8, precisionKm: 1 } },
                        { id: 'card-2', title: 'Need water', summary: 'Help', category: 'food', status: 'open', urgency: 2, updatedAt: '2026-07-01T00:00:00.000Z', location: { lat: 1.3001, lng: 103.8001, precisionKm: 1 } },
                    ]}
                    clusters={[{ id: 'cluster-1', count: 2, postIds: ['card-1', 'card-2'], lat: 1.30005, lng: 103.80005, radiusMeters: 1500, urgencyMax: 3, status: 'open', label: '2 requests in approximate area' }]}
                    center={{ lat: 1.3, lng: 103.8 }}
                    onSelectPostId={vi.fn()}
                    onTilesFailed={vi.fn()}
                />,
            );
        });

        // Should have cluster class for clustered items
        const clusterCalls = leafletMock.circle.mock.calls.filter(
            (call: unknown[]) => (call[1] as { className?: string })?.className === 'mh-map-cluster',
        );
        expect(clusterCalls.length).toBeGreaterThan(0);

        await act(async () => root.unmount());
    });
});
