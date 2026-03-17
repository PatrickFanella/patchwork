import { describe, expect, it } from 'vitest';
import {
    capabilitySupportsAidCategory,
    mapAidCategoryToDirectoryCategories,
} from './category-policy.js';

describe('category policy', () => {
    it('maps aid categories to directory categories deterministically', () => {
        expect(mapAidCategoryToDirectoryCategories(undefined)).toEqual([]);
        expect(mapAidCategoryToDirectoryCategories('food')).toEqual([
            'food-bank',
        ]);
        expect(mapAidCategoryToDirectoryCategories('shelter')).toEqual([
            'shelter',
        ]);
        expect(mapAidCategoryToDirectoryCategories('medical')).toEqual([
            'clinic',
        ]);
        expect(mapAidCategoryToDirectoryCategories('transport')).toEqual([]);
    });

    it('evaluates volunteer capability support by aid category', () => {
        expect(capabilitySupportsAidCategory('food-delivery', 'food')).toBe(
            true,
        );
        expect(capabilitySupportsAidCategory('transport', 'food')).toBe(false);

        expect(capabilitySupportsAidCategory('first-aid', 'medical')).toBe(
            true,
        );
        expect(capabilitySupportsAidCategory('transport', 'medical')).toBe(
            false,
        );

        expect(capabilitySupportsAidCategory('other', 'shelter')).toBe(true);
        expect(capabilitySupportsAidCategory('transport', 'shelter')).toBe(
            false,
        );

        expect(capabilitySupportsAidCategory('translation', 'other')).toBe(
            true,
        );
    });
});
