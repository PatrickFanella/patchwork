import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useId, useState } from 'react';
import L from 'leaflet';
import { leafletLayer } from 'protomaps-leaflet';
import type { MapAidCard } from '../../map-ux.js';
import {
    clusterDistanceMetersForZoom,
    clusterMapCards,
    toApproximateMapMarker,
} from '../../map-ux.js';
import { resolveMapTileUrl } from '../../config.js';

export interface InteractiveMapProps {
    cards: readonly MapAidCard[];
    selectedPostId?: string;
    center: { lat: number; lng: number };
    onSelectPostId: (postId: string | undefined) => void;
    onTilesFailed: (message: string) => void;
}

export const InteractiveMap = ({
    cards,
    selectedPostId,
    center,
    onSelectPostId,
    onTilesFailed,
}: InteractiveMapProps) => {
    const mapRef = useRef<HTMLDivElement | null>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const onTilesFailedRef = useRef(onTilesFailed);
    const onSelectPostIdRef = useRef(onSelectPostId);
    const [zoom, setZoom] = useState(9);
    const mapId = useId();
    const instructionsId = `map-instructions-${mapId.replace(/:/g, '')}`;

    // Check for reduced motion preference
    const prefersReducedMotion = useRef(
        typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );

    useEffect(() => {
        onTilesFailedRef.current = onTilesFailed;
    }, [onTilesFailed]);

    useEffect(() => {
        onSelectPostIdRef.current = onSelectPostId;
    }, [onSelectPostId]);

    const markers = useMemo(
        () => cards.map(toApproximateMapMarker).filter((value): value is NonNullable<typeof value> => Boolean(value)),
        [cards],
    );
    const clusters = useMemo(
        () =>
            clusterMapCards(
                cards,
                clusterDistanceMetersForZoom(zoom, center.lat),
            ),
        [cards, center.lat, zoom],
    );
    const clusteredPostIds = useMemo(
        () => new Set(clusters.filter(cluster => cluster.count > 1).flatMap(cluster => cluster.postIds)),
        [clusters],
    );
    const tileUrl = resolveMapTileUrl(import.meta.env, import.meta.env.PROD);

    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;
        const map = L.map(mapRef.current, {
            zoomControl: true,
            zoomAnimation: !prefersReducedMotion.current,
            fadeAnimation: !prefersReducedMotion.current,
        }).setView([center.lat, center.lng], 9);
        const onZoomEnd = () => setZoom(map.getZoom());
        map.on('zoomend', onZoomEnd);
        const layer = leafletLayer({
            url: tileUrl,
            flavor: 'light',
            lang: 'en',
            maxDataZoom: 10,
        });
        layer.on('tileerror', (event: unknown) => {
            onTilesFailedRef.current(`Tile layer failed to load${event ? '.' : ''}`);
        });
        layer.addTo(map);
        L.control.attribution({ prefix: false }).addTo(map);
        map.attributionControl.addAttribution('© OpenStreetMap contributors');
        mapInstance.current = map;
        return () => {
            map.off('zoomend', onZoomEnd);
            mapInstance.current = null;
            map.remove();
        };
    }, [tileUrl]);

    useEffect(() => {
        if (!mapInstance.current) return;
        mapInstance.current.setView([center.lat, center.lng], mapInstance.current.getZoom());
    }, [center.lat, center.lng]);

    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;
        const layers: L.Layer[] = [];
        for (const cluster of clusters) {
            if (cluster.count <= 1) continue;
            const circle = L.circle([cluster.lat, cluster.lng], {
                radius: cluster.radiusMeters,
                className:
                    selectedPostId && cluster.postIds.includes(selectedPostId) ?
                        'mh-map-cluster is-selected'
                    :   'mh-map-cluster',
            }).addTo(map);
            circle.bindTooltip(cluster.label, { permanent: false });
            circle.on('click', () => {
                map.setView(
                    [cluster.lat, cluster.lng],
                    Math.min(18, map.getZoom() + 2),
                );
            });
            layers.push(circle);
        }
        for (const marker of markers) {
            if (!marker || clusteredPostIds.has(marker.id)) continue;
            const circle = L.circle([marker.lat, marker.lng], {
                radius: marker.radiusMeters,
                className: marker.id === selectedPostId ? 'mh-map-circle is-selected' : 'mh-map-circle',
            }).addTo(map);
            circle.on('click', () => onSelectPostIdRef.current(marker.id));
            layers.push(circle);
        }
        return () => layers.forEach(layer => layer.remove());
    }, [clusteredPostIds, clusters, markers, selectedPostId]);

    const hasItems = markers.length > 0 || clusters.length > 0;

    return (
        <div className="mh-map-container">
            {!hasItems && (
                <p id={instructionsId} className="mh-map-empty-message">
                    No aid requests in the current area. Try widening the search radius or clearing filters.
                </p>
            )}
            {hasItems && (
                <p id={instructionsId} className="mh-map-instructions">
                    Use arrow keys to pan and plus/minus to zoom. Use the request
                    list below for keyboard-accessible selection.
                </p>
            )}
            <div
                ref={mapRef}
                className="mh-interactive-map"
                role="region"
                aria-label="Interactive aid map showing approximate request locations"
                aria-describedby={instructionsId}
                tabIndex={0}
                onKeyDown={event => {
                    if (event.key === 'Escape') {
                        onSelectPostIdRef.current(undefined);
                    }
                }}
            />
            <div className="mh-map-legend">
                <div className="mh-map-legend-item">
                    <span
                        className="mh-map-legend-circle mh-map-legend-aid"
                        aria-hidden="true"
                    />
                    <span>Single request (approximate area)</span>
                </div>
                <div className="mh-map-legend-item">
                    <span
                        className="mh-map-legend-circle mh-map-legend-cluster"
                        aria-hidden="true"
                    />
                    <span>Multiple requests cluster</span>
                </div>
                <div className="mh-map-legend-note">
                    Centers are displaced within approximate areas (≥1km) for privacy
                </div>
            </div>
        </div>
    );
};
