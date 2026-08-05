import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useId, useState } from 'react';
import L from 'leaflet';
import { leafletLayer } from 'protomaps-leaflet';
import type { MapAidCard } from '../../map-ux.js';
import {
    clusterExpansionZoom,
    clusterDistanceMetersForZoom,
    clusterMapCards,
    toApproximateMapMarker,
} from '../../map-ux.js';
import {
    currentExactPublicAddress,
    type ResourceDirectoryCard,
} from '../../resource-directory-ux.js';
import { resolveMapTileUrl } from '../../config.js';
import { useLocale } from '../../i18n';

export interface InteractiveMapProps {
    cards: readonly MapAidCard[];
    resources?: readonly ResourceDirectoryCard[];
    selectedPostId?: string;
    center: { lat: number; lng: number };
    onSelectPostId: (postId: string | undefined) => void;
    onFocusArea?: (area: {
        center: { lat: number; lng: number };
        radiusMeters: number;
        label: string;
    }) => void;
    focusedArea?: {
        center: { lat: number; lng: number };
        radiusMeters: number;
    };
    onTilesFailed: (message: string) => void;
}

type CircleStyle = 'filled' | 'outline' | 'contrast';
const circleStyleStorageKey = 'patchwork.map.circle-style.v1';
const readCircleStyle = (): CircleStyle => {
    if (typeof window === 'undefined') return 'filled';
    try {
        const stored = window.localStorage.getItem(circleStyleStorageKey);
        return stored === 'outline' ||
            stored === 'contrast' ||
            stored === 'filled'
            ? stored
            : 'filled';
    } catch {
        return 'filled';
    }
};

const sameCenter = (
    left: { lat: number; lng: number },
    right: { lat: number; lng: number },
): boolean =>
    Math.abs(left.lat - right.lat) < 0.000001 &&
    Math.abs(left.lng - right.lng) < 0.000001;

export const InteractiveMap = ({
    cards,
    resources = [],
    selectedPostId,
    center,
    onSelectPostId,
    onFocusArea,
    focusedArea,
    onTilesFailed,
}: InteractiveMapProps) => {
    const { t } = useLocale();
    const mapRef = useRef<HTMLDivElement | null>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const onTilesFailedRef = useRef(onTilesFailed);
    const onSelectPostIdRef = useRef(onSelectPostId);
    const onFocusAreaRef = useRef(onFocusArea);
    const [zoom, setZoom] = useState(9);
    const [circleStyle, setCircleStyle] =
        useState<CircleStyle>(readCircleStyle);
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

    useEffect(() => {
        onFocusAreaRef.current = onFocusArea;
    }, [onFocusArea]);

    const markers = useMemo(
        () =>
            cards
                .map(toApproximateMapMarker)
                .filter((value): value is NonNullable<typeof value> =>
                    Boolean(value),
                ),
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
        () =>
            new Set(
                clusters
                    .filter((cluster) => cluster.count > 1)
                    .flatMap((cluster) => cluster.postIds),
            ),
        [clusters],
    );
    const exactPlaces = useMemo(
        () =>
            resources.flatMap((resource) => {
                const exact = currentExactPublicAddress(resource);
                if (!exact) {
                    return [];
                }
                return [{ resource, exact }];
            }),
        [resources],
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
            onTilesFailedRef.current(
                `Tile layer failed to load${event ? '.' : ''}`,
            );
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
        mapInstance.current.setView(
            [center.lat, center.lng],
            mapInstance.current.getZoom(),
        );
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
                    (selectedPostId &&
                        cluster.postIds.includes(selectedPostId)) ||
                    (focusedArea &&
                        sameCenter(focusedArea.center, {
                            lat: cluster.lat,
                            lng: cluster.lng,
                        }))
                        ? 'mh-map-cluster is-selected'
                        : 'mh-map-cluster',
            }).addTo(map);
            circle.bindTooltip(`${cluster.count} · U${cluster.urgencyMax}`, {
                permanent: true,
                direction: 'center',
                className: 'mh-map-circle-label mh-map-cluster-label',
            });
            circle.on('click', () => {
                const nextZoom = clusterExpansionZoom(
                    cards,
                    cluster.postIds,
                    map.getZoom(),
                    cluster.lat,
                );
                map.setView([cluster.lat, cluster.lng], nextZoom);
                onFocusAreaRef.current?.({
                    center: { lat: cluster.lat, lng: cluster.lng },
                    radiusMeters: Math.ceil(cluster.radiusMeters),
                    label: `${cluster.count} requests`,
                });
            });
            layers.push(circle);
        }
        for (const marker of markers) {
            if (!marker || clusteredPostIds.has(marker.id)) continue;
            const circle = L.circle([marker.lat, marker.lng], {
                radius: marker.radiusMeters,
                className:
                    marker.id === selectedPostId
                        ? 'mh-map-circle is-selected'
                        : 'mh-map-circle',
            }).addTo(map);
            circle.bindTooltip(`${marker.label} · U${marker.urgency}`, {
                permanent: true,
                direction: 'center',
                className: 'mh-map-circle-label mh-map-request-label',
            });
            circle.on('click', () => {
                map.setView([marker.lat, marker.lng], map.getZoom());
                onFocusAreaRef.current?.({
                    center: { lat: marker.lat, lng: marker.lng },
                    radiusMeters: marker.radiusMeters,
                    label: marker.label,
                });
                onSelectPostIdRef.current(marker.id);
            });
            layers.push(circle);
        }
        for (const { resource, exact } of exactPlaces) {
            const marker = L.circleMarker([exact.latitude, exact.longitude], {
                radius: 7,
                className:
                    focusedArea &&
                    sameCenter(focusedArea.center, {
                        lat: exact.latitude,
                        lng: exact.longitude,
                    })
                        ? 'mh-map-place is-selected'
                        : 'mh-map-place',
            }).addTo(map);
            marker.bindTooltip(
                `${resource.name} · ${resource.openHours ?? 'hours unavailable'}`,
                {
                    permanent: true,
                    direction: 'right',
                    className: 'mh-map-place-label',
                },
            );
            marker.on('click', () => {
                map.setView([exact.latitude, exact.longitude], 15);
                onFocusAreaRef.current?.({
                    center: { lat: exact.latitude, lng: exact.longitude },
                    radiusMeters: 1000,
                    label: resource.name,
                });
            });
            layers.push(marker);
        }
        return () => layers.forEach((layer) => layer.remove());
    }, [
        cards,
        clusteredPostIds,
        clusters,
        exactPlaces,
        focusedArea,
        markers,
        selectedPostId,
    ]);

    const hasItems =
        markers.length > 0 || clusters.length > 0 || exactPlaces.length > 0;

    return (
        <div className={`mh-map-container mh-map-style-${circleStyle}`}>
            <fieldset className='mh-map-style-control'>
                <legend>{t('map.circleStyle')}</legend>
                {(
                    [
                        ['filled', t('map.filled')],
                        ['outline', t('map.outline')],
                        ['contrast', t('map.highContrast')],
                    ] as const
                ).map(([value, label]) => (
                    <label key={value}>
                        <input
                            type='radio'
                            name={`circle-style-${mapId}`}
                            value={value}
                            checked={circleStyle === value}
                            onChange={() => {
                                setCircleStyle(value);
                                try {
                                    window.localStorage.setItem(
                                        circleStyleStorageKey,
                                        value,
                                    );
                                } catch {
                                    // Style choice remains usable for this page
                                    // even when storage is unavailable.
                                }
                            }}
                        />
                        <span>{label}</span>
                    </label>
                ))}
            </fieldset>
            {!hasItems && (
                <p id={instructionsId} className='mh-map-empty-message'>
                    {t('map.emptyInteractive')}
                </p>
            )}
            {hasItems && (
                <p id={instructionsId} className='mh-map-instructions'>
                    {t('map.instructions')}
                </p>
            )}
            <div
                ref={mapRef}
                className='mh-interactive-map'
                role='region'
                aria-label={t('map.interactiveLabel')}
                aria-describedby={instructionsId}
                tabIndex={0}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        onSelectPostIdRef.current(undefined);
                    }
                }}
            />
            <div className='mh-map-legend'>
                <div className='mh-map-legend-item'>
                    <span
                        className='mh-map-legend-circle mh-map-legend-aid'
                        aria-hidden='true'
                    />
                    <span>{t('map.singleRequest')}</span>
                </div>
                <div className='mh-map-legend-item'>
                    <span
                        className='mh-map-legend-circle mh-map-legend-cluster'
                        aria-hidden='true'
                    />
                    <span>{t('map.cluster')}</span>
                </div>
                <div className='mh-map-legend-item'>
                    <span className='mh-map-legend-place' aria-hidden='true' />
                    <span>{t('map.publicPlace')}</span>
                </div>
                <div className='mh-map-legend-note'>{t('map.legendNote')}</div>
            </div>
        </div>
    );
};
