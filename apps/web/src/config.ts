export const DEFAULT_MAP_TILE_URL = '/tiles/us.pmtiles';
const VERSIONED_MAP_TILE_URL = /^\/tiles\/us\.[0-9a-f]{64}\.pmtiles$/;

export const resolveMapTileUrl = (
    env: Record<string, string | boolean | undefined>,
    production: boolean,
): string => {
    const configured = env.VITE_MAP_TILE_URL;
    if (typeof configured === 'string' && configured.trim().length > 0) {
        if (!VERSIONED_MAP_TILE_URL.test(configured)) {
            throw new Error(
                'VITE_MAP_TILE_URL must be a same-origin, content-addressed PMTiles URL.',
            );
        }
        return configured;
    }
    if (production) {
        throw new Error('VITE_MAP_TILE_URL is required in production builds.');
    }
    return DEFAULT_MAP_TILE_URL;
};
