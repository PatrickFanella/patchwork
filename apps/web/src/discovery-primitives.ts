import {
    aidCategories,
    aidStatuses,
    type AidCategory,
    type AidStatus,
    type DiscoveryFilterState,
    type FeedTab,
} from './discovery-filters.js';

export interface DiscoveryFilterChip<TValue extends string | number = string> {
    id: string;
    label: string;
    value: TValue;
    active: boolean;
}

export interface DiscoveryFilterChipModel {
    tabs: readonly DiscoveryFilterChip<FeedTab>[];
    categories: readonly DiscoveryFilterChip<AidCategory>[];
    statuses: readonly DiscoveryFilterChip<AidStatus>[];
    urgency: readonly DiscoveryFilterChip<1 | 2 | 3 | 4 | 5>[];
}

const urgencyLevels = [1, 2, 3, 4, 5] as const;

const toTitle = (value: string): string =>
    value
        .split('-')
        .map(part => part[0]?.toUpperCase() + part.slice(1))
        .join(' ');

export const buildDiscoveryFilterChipModel = (
    state: DiscoveryFilterState,
): DiscoveryFilterChipModel => {
    return {
        tabs: [
            {
                id: 'tab-latest',
                label: 'Latest',
                value: 'latest',
                active: state.feedTab === 'latest',
            },
            {
                id: 'tab-nearby',
                label: 'Nearby',
                value: 'nearby',
                active: state.feedTab === 'nearby',
            },
        ],
        categories: aidCategories.map(category => ({
            id: `cat-${category}`,
            label: toTitle(category),
            value: category,
            active: state.category === category,
        })),
        statuses: aidStatuses.map(status => ({
            id: `status-${status}`,
            label: toTitle(status),
            value: status,
            active: state.status === status,
        })),
        urgency: urgencyLevels.map(level => ({
            id: `urgency-${level}`,
            label: `Urgency ${level}+`,
            value: level,
            active: state.minUrgency === level,
        })),
    };
};
