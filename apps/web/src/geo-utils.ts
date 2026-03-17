import type { DiscoveryCenter } from './discovery-filters.js';

export const earthRadiusMeters = 6_371_000;

export const haversineDistanceMeters = (
    a: DiscoveryCenter,
    b: { lat: number; lng: number },
): number => {
    const latA = (a.lat * Math.PI) / 180;
    const latB = (b.lat * Math.PI) / 180;
    const latDelta = ((b.lat - a.lat) * Math.PI) / 180;
    const lngDelta = ((b.lng - a.lng) * Math.PI) / 180;

    const h =
        Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
        Math.cos(latA) *
            Math.cos(latB) *
            Math.sin(lngDelta / 2) *
            Math.sin(lngDelta / 2);

    return (
        2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
    );
};
