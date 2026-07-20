import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_TILE_URL, resolveMapTileUrl } from './config.js';

describe('web config', () => {
    it('defaults map tiles in dev and requires them in production', () => {
        const versionedUrl = `/tiles/us.${'a'.repeat(64)}.pmtiles`;
        expect(resolveMapTileUrl({}, false)).toBe(DEFAULT_MAP_TILE_URL);
        expect(
            resolveMapTileUrl({ VITE_MAP_TILE_URL: versionedUrl }, true),
        ).toBe(versionedUrl);
        expect(() => resolveMapTileUrl({}, true)).toThrow(
            'VITE_MAP_TILE_URL is required in production builds.',
        );
        expect(() =>
            resolveMapTileUrl(
                { VITE_MAP_TILE_URL: 'https://tiles.example/us.pmtiles' },
                true,
            ),
        ).toThrow('same-origin, content-addressed');
    });
});
