import type {
    AidPostRecord,
    DirectoryResourceRecord,
    VolunteerProfileRecord,
} from '@patchwork/at-lexicons';

export const AID_CATEGORY_TO_DIRECTORY_CATEGORIES: Readonly<
    Record<
        AidPostRecord['category'],
        readonly DirectoryResourceRecord['category'][]
    >
> = Object.freeze({
    food: ['food-bank'],
    shelter: ['shelter'],
    medical: ['clinic'],
    transport: [],
    childcare: [],
    other: [],
});

const AID_CATEGORY_TO_PRIMARY_VOLUNTEER_CAPABILITY: Partial<
    Record<
        AidPostRecord['category'],
        VolunteerProfileRecord['capabilities'][number]
    >
> = Object.freeze({
    food: 'food-delivery',
    shelter: 'other',
    medical: 'first-aid',
    transport: 'transport',
    childcare: 'childcare',
});

export const mapAidCategoryToDirectoryCategories = (
    category: AidPostRecord['category'] | undefined,
): readonly DirectoryResourceRecord['category'][] => {
    if (!category) {
        return [];
    }

    return AID_CATEGORY_TO_DIRECTORY_CATEGORIES[category];
};

export const capabilitySupportsAidCategory = (
    capability: VolunteerProfileRecord['capabilities'][number],
    category: AidPostRecord['category'],
): boolean => {
    const expectedCapability =
        AID_CATEGORY_TO_PRIMARY_VOLUNTEER_CAPABILITY[category];

    if (!expectedCapability) {
        return true;
    }

    return capability === expectedCapability;
};
