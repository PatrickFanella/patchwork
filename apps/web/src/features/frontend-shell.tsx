import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type MouseEvent,
} from 'react';
import { ariaLive } from '../a11y';
import { shellSections } from '../app-shell';
import {
    aidCategories,
    applyDiscoveryFilterPatch,
    defaultDiscoveryFilterState,
    parseDiscoveryFilterState,
    serializeDiscoveryFilterState,
    type AidStatus,
    type DiscoveryFilterState,
} from '../discovery-filters';
import { buildDiscoveryFilterChipModel } from '../discovery-primitives';
import {
    applyFeedLifecycleAction,
    buildFeedViewModel,
    type FeedAidCard,
    type FeedLifecycleAction,
    type FeedStatusTransition,
    type LifecycleStatus,
} from '../feed-ux';
import {
    buildMapViewModel,
    closeMapDetailDrawer,
    openMapDetailDrawer,
    type MapAidCard,
    type MapTriageAction,
} from '../map-ux';
import {
    validatePostingDraft,
    type AidPostingCategory,
    type NormalizedAidPostingDraft,
    type PostingValidationIssue,
} from '../posting-form';
import {
    buildResourceOverlayViewModel,
    closeResourceDetailPanel,
    openResourceDetailPanel,
    resolveResourceDirectoryUiState,
    type DirectoryResourceCategory,
    type ResourceDirectoryCard,
} from '../resource-directory-ux';
import {
    buildVolunteerProfileCreatePayload,
    isVolunteerFullyVerified,
    summarizeCheckpoints,
    validateVolunteerOnboardingDraft,
    type VolunteerOnboardingDraft,
    type VolunteerOnboardingValidationIssue,
} from '../volunteer-onboarding';
import {
    buildChatInitiationRequest,
    defaultChatLaunchState,
    reduceChatLaunchState,
    toChatStatusNotice,
    type ChatEntrySurface,
    type ChatInitiationIntent,
    type ChatLaunchState,
} from '../chat-ux';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Panel } from '../components/Panel';
import { CoreFlowSurfaces } from '../components/surfaces';
import { TextLink } from '../components/TextLink';
import {
    type ApiDataOrigin,
    createAidPostViaApi,
    deactivateAccountViaApi,
    exportDataViaApi,
    fetchDirectoryCardsFromApi,
    fetchFeedRecordsFromApi,
    fetchSettingsAuditFromApi,
    fetchSettingsFromApi,
    initiateChatViaApi,
    updateSettingsViaApi,
    transitionAidPostViaApi,
} from './api-client';
import {
    type SettingsPatch,
    type SettingsSection,
    applySettingsPatch,
    defaultSettingsViewModel,
    isSettingsDirty,
    settingsSectionDescriptions,
    settingsSectionLabels,
    settingsSections,
    validateSettings,
} from '../settings-ux';
import {
    type UserSettings,
    geoSharingPrecisions,
    privacyLevels,
} from '@patchwork/shared';
import {
    defaultDiscoveryCenter,
    defaultVolunteerDraft,
    initialFeedRecords,
    initialResourceCards,
    type FeedRecordEnvelope,
} from './fixtures';

const appRoutes = [
    '/',
    '/map',
    '/feed',
    '/resources',
    '/volunteer',
    '/posting',
    '/chat',
    '/settings',
    '/moderation',
    '/inbox',
    '/notifications',
    '/scheduling',
    '/feedback',
    '/groups',
    '/legal/terms',
    '/legal/privacy',
    '/legal/community-guidelines',
] as const;

type AppRoute = (typeof appRoutes)[number];

interface FrontendShellProps {
    appTitle: string;
}

const routeLabels: Readonly<Record<AppRoute, string>> = {
    '/': 'Home',
    '/map': 'Map',
    '/feed': 'Feed',
    '/resources': 'Resources',
    '/volunteer': 'Volunteer',
    '/posting': 'Posting',
    '/chat': 'Chat',
    '/settings': 'Settings',
    '/moderation': 'Moderation',
    '/inbox': 'Inbox',
    '/notifications': 'Notifications',
    '/scheduling': 'Scheduling',
    '/feedback': 'Feedback',
    '/groups': 'Groups',
    '/legal/terms': 'Terms of Service',
    '/legal/privacy': 'Privacy Policy',
    '/legal/community-guidelines': 'Community Guidelines',
};

const resourceCategoryOptions: readonly DirectoryResourceCategory[] = [
    'food-bank',
    'shelter',
    'clinic',
    'legal-aid',
    'hotline',
    'other',
];

const volunteerCapabilityOptions: readonly VolunteerOnboardingDraft['capabilities'][number][] =
    [
        'transport',
        'food-delivery',
        'translation',
        'first-aid',
        'childcare',
        'other',
    ];

const volunteerAvailabilityOptions: readonly VolunteerOnboardingDraft['availability'][] =
    ['immediate', 'within-24h', 'scheduled', 'unavailable'];

const volunteerContactOptions: readonly VolunteerOnboardingDraft['contactPreference'][] =
    ['chat-only', 'chat-or-call'];

const checkpointStatusOptions: readonly VolunteerOnboardingDraft['checkpoints']['identityCheck'][] =
    ['pending', 'approved', 'rejected'];

const urgencyPreferenceOptions: readonly VolunteerOnboardingDraft['preferredUrgencies'][number][] =
    ['low', 'medium', 'high', 'critical'];

const nowIso = (): string => new Date().toISOString();

const nearbyDefaultRadiusMeters = 20000;

const defaultShellDiscoveryState = applyDiscoveryFilterPatch(
    defaultDiscoveryFilterState,
    {
        status: undefined,
    },
);

const buildNearbyPatch = (): Partial<DiscoveryFilterState> => ({
    feedTab: 'nearby',
    center: defaultDiscoveryCenter,
    radiusMeters: nearbyDefaultRadiusMeters,
});

const toSeverityTone = (
    status: AidStatus,
): 'neutral' | 'info' | 'success' | 'danger' => {
    if (status === 'open') {
        return 'danger';
    }
    if (status === 'in-progress') {
        return 'info';
    }
    if (status === 'resolved') {
        return 'success';
    }
    return 'neutral';
};

const toUrgencyTone = (
    urgency: 1 | 2 | 3 | 4 | 5,
): 'neutral' | 'info' | 'success' | 'danger' => {
    if (urgency >= 4) {
        return 'danger';
    }
    if (urgency >= 3) {
        return 'info';
    }
    return 'neutral';
};

const toMapAidCard = (record: FeedRecordEnvelope): MapAidCard => {
    const fallbackLocation = {
        lat: defaultDiscoveryCenter.lat,
        lng: defaultDiscoveryCenter.lng,
    };

    const location = record.card.location ?? fallbackLocation;

    return {
        id: record.card.id,
        title: record.card.title,
        summary: record.card.description,
        category: record.card.category,
        status: record.card.status,
        urgency: record.card.urgency,
        updatedAt: record.card.updatedAt,
        location: {
            lat: location.lat,
            lng: location.lng,
            precisionMeters: 300 + record.card.urgency * 60,
            areaLabel: `Grid ${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`,
        },
    };
};

const parseCommaList = (value: string): string[] => {
    return value
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
};

const formatCategoryLabel = (value: string): string => {
    return value
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

const normalizeRoute = (pathname: string): AppRoute => {
    return appRoutes.find(route => route === pathname) ?? '/';
};

const readCurrentRoute = (): AppRoute => {
    if (typeof window === 'undefined') {
        return '/';
    }

    return normalizeRoute(window.location.pathname);
};

const readDiscoveryStateFromUrl = (
    fallback: DiscoveryFilterState,
): DiscoveryFilterState => {
    if (typeof window === 'undefined') {
        return fallback;
    }

    return parseDiscoveryFilterState(window.location.search, fallback);
};

interface DiscoveryFiltersPanelProps {
    idPrefix: string;
    state: DiscoveryFilterState;
    onPatch: (patch: Partial<DiscoveryFilterState>) => void;
}

const DiscoveryFiltersPanel = ({
    idPrefix,
    state,
    onPatch,
}: DiscoveryFiltersPanelProps) => {
    const chipModel = useMemo(
        () => buildDiscoveryFilterChipModel(state),
        [state],
    );

    const latValue = state.center?.lat ?? defaultDiscoveryCenter.lat;
    const lngValue = state.center?.lng ?? defaultDiscoveryCenter.lng;

    return (
        <Panel title='Discovery filters'>
            <label
                htmlFor={`${idPrefix}-search`}
                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
            >
                Search text
            </label>
            <Input
                id={`${idPrefix}-search`}
                placeholder='Search title, description, or area'
                value={state.text ?? ''}
                onChange={event => {
                    const nextValue = event.target.value.trim();
                    onPatch({
                        text: nextValue.length > 0 ? nextValue : undefined,
                    });
                }}
            />

            <div className='mt-4 grid gap-4'>
                <div>
                    <p className='mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'>
                        Feed tab
                    </p>
                    <div className='flex flex-wrap gap-2'>
                        {chipModel.tabs.map(tab => (
                            <Button
                                key={tab.id}
                                variant={tab.active ? 'secondary' : 'neutral'}
                                className='px-3 py-1 text-xs'
                                onClick={() => onPatch({ feedTab: tab.value })}
                            >
                                {tab.label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div>
                    <p className='mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'>
                        Category
                    </p>
                    <div className='flex flex-wrap gap-2'>
                        {chipModel.categories.map(category => (
                            <Button
                                key={category.id}
                                variant={
                                    category.active ? 'secondary' : 'neutral'
                                }
                                className='px-3 py-1 text-xs'
                                onClick={() => {
                                    onPatch({
                                        category:
                                            category.active ? undefined : (
                                                category.value
                                            ),
                                    });
                                }}
                            >
                                {category.label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div>
                    <p className='mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'>
                        Status
                    </p>
                    <div className='flex flex-wrap gap-2'>
                        {chipModel.statuses.map(status => (
                            <Button
                                key={status.id}
                                variant={
                                    status.active ? 'secondary' : 'neutral'
                                }
                                className='px-3 py-1 text-xs'
                                onClick={() => {
                                    onPatch({
                                        status:
                                            status.active ? undefined : (
                                                status.value
                                            ),
                                    });
                                }}
                            >
                                {status.label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div>
                    <p className='mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'>
                        Minimum urgency
                    </p>
                    <div className='flex flex-wrap gap-2'>
                        {chipModel.urgency.map(level => (
                            <Button
                                key={level.id}
                                variant={level.active ? 'secondary' : 'neutral'}
                                className='px-3 py-1 text-xs'
                                onClick={() => {
                                    onPatch({
                                        minUrgency:
                                            level.active ? undefined : (
                                                level.value
                                            ),
                                    });
                                }}
                            >
                                {level.label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className='grid gap-3 sm:grid-cols-3'>
                    <div>
                        <label
                            htmlFor={`${idPrefix}-radius`}
                            className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'
                        >
                            Radius (m)
                        </label>
                        <Input
                            id={`${idPrefix}-radius`}
                            type='number'
                            min={300}
                            max={100000}
                            placeholder={String(nearbyDefaultRadiusMeters)}
                            value={state.radiusMeters ?? ''}
                            onChange={event => {
                                const value = Number.parseInt(
                                    event.target.value,
                                    10,
                                );
                                onPatch({
                                    radiusMeters:
                                        Number.isNaN(value) ? undefined : value,
                                });
                            }}
                        />
                    </div>
                    <div>
                        <label
                            htmlFor={`${idPrefix}-lat`}
                            className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'
                        >
                            Center lat
                        </label>
                        <Input
                            id={`${idPrefix}-lat`}
                            type='number'
                            step='0.0001'
                            value={latValue}
                            onChange={event => {
                                const value = Number.parseFloat(
                                    event.target.value,
                                );
                                if (Number.isNaN(value)) {
                                    return;
                                }
                                onPatch({
                                    center: {
                                        lat: value,
                                        lng: state.center?.lng ?? lngValue,
                                    },
                                });
                            }}
                        />
                    </div>
                    <div>
                        <label
                            htmlFor={`${idPrefix}-lng`}
                            className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'
                        >
                            Center lng
                        </label>
                        <Input
                            id={`${idPrefix}-lng`}
                            type='number'
                            step='0.0001'
                            value={lngValue}
                            onChange={event => {
                                const value = Number.parseFloat(
                                    event.target.value,
                                );
                                if (Number.isNaN(value)) {
                                    return;
                                }
                                onPatch({
                                    center: {
                                        lat: state.center?.lat ?? latValue,
                                        lng: value,
                                    },
                                });
                            }}
                        />
                    </div>
                </div>

                <div className='flex flex-wrap items-center justify-between gap-3 border-t-2 border-mh-borderSoft pt-4'>
                    <Button
                        variant='neutral'
                        className='px-3 py-1 text-xs'
                        onClick={() => {
                            onPatch({
                                feedTab: 'latest',
                                text: undefined,
                                category: undefined,
                                status: undefined,
                                minUrgency: undefined,
                                center: undefined,
                                radiusMeters: undefined,
                                since: undefined,
                            });
                        }}
                    >
                        Reset filters
                    </Button>
                    <p className='text-xs text-mh-textSoft'>
                        Filters persist in the URL for sharable triage context.
                    </p>
                </div>
            </div>
        </Panel>
    );
};

interface DashboardRouteProps {
    appTitle: string;
    onNavigate: (route: AppRoute) => void;
    discoveryState: DiscoveryFilterState;
    onPatchDiscovery: (patch: Partial<DiscoveryFilterState>) => void;
}

const DashboardRoute = ({
    appTitle,
    onNavigate,
    discoveryState,
    onPatchDiscovery,
}: DashboardRouteProps) => {
    return (
        <>
            <header className='mb-8 border-b-2 border-mh-border pb-6 sm:pb-8'>
                <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
                    <p className='text-xs font-bold uppercase tracking-[0.14em] text-mh-textMuted'>
                        Mutual aid shell · phase 8
                    </p>
                    <Badge tone='danger'>Safety guardrails active</Badge>
                </div>

                <div className='grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'>
                    <div>
                        <h1 className='font-heading text-4xl font-black uppercase leading-none tracking-tight sm:text-5xl md:text-6xl lg:text-7xl'>
                            {appTitle}
                        </h1>
                        <p className='mt-4 max-w-xl text-base text-mh-textMuted sm:text-lg'>
                            Coordinate urgent neighborhood support with map,
                            feed, posting, resource, chat, and volunteer
                            workflows in one privacy-first interface.
                        </p>
                        <div className='mt-5 flex flex-wrap gap-2'>
                            <Button
                                onClick={() => {
                                    onPatchDiscovery(buildNearbyPatch());
                                    onNavigate('/map');
                                }}
                            >
                                Open map triage
                            </Button>
                            <Button
                                variant='secondary'
                                onClick={() => onNavigate('/posting')}
                            >
                                Open posting form
                            </Button>
                            <Button
                                variant='neutral'
                                onClick={() => onNavigate('/chat')}
                            >
                                Open chat handoff
                            </Button>
                        </div>
                    </div>

                    <aside className='mh-card p-4 sm:p-5'>
                        <p className='text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'>
                            Live response posture
                        </p>
                        <ul className='mt-3 grid gap-2'>
                            <li className='mh-stat-tile'>
                                <p className='text-xs uppercase tracking-widest text-mh-textSoft'>
                                    Requests triaged (24h)
                                </p>
                                <p className='mt-1 font-heading text-3xl font-black leading-none text-mh-text'>
                                    127
                                </p>
                            </li>
                            <li className='mh-stat-tile'>
                                <p className='text-xs uppercase tracking-widest text-mh-textSoft'>
                                    Median response
                                </p>
                                <p className='mt-1 font-heading text-3xl font-black leading-none text-mh-text'>
                                    11m
                                </p>
                            </li>
                            <li className='mh-stat-tile'>
                                <p className='text-xs uppercase tracking-widest text-mh-textSoft'>
                                    Verified volunteers
                                </p>
                                <p className='mt-1 font-heading text-3xl font-black leading-none text-mh-text'>
                                    42
                                </p>
                            </li>
                        </ul>
                    </aside>
                </div>
            </header>

            <div className='grid gap-6 lg:grid-cols-5'>
                <section className='lg:col-span-3'>
                    <Panel title='Discovery shell'>
                        <p className='mb-3 text-sm text-mh-textMuted'>
                            Search support requests by category and route to the
                            safest nearby response path.
                        </p>
                        <label
                            htmlFor='search-requests'
                            className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                        >
                            Search requests
                        </label>
                        <Input
                            id='search-requests'
                            placeholder='e.g. food, shelter, transport'
                            value={discoveryState.text ?? ''}
                            onChange={event => {
                                const nextValue = event.target.value.trim();
                                onPatchDiscovery({
                                    text:
                                        nextValue.length > 0 ?
                                            nextValue
                                        :   undefined,
                                });
                            }}
                        />
                        <div className='mt-4 flex flex-wrap gap-2'>
                            <Button
                                onClick={() => {
                                    onPatchDiscovery(buildNearbyPatch());
                                    onNavigate('/map');
                                }}
                            >
                                Find nearby
                            </Button>
                            <Button
                                variant='secondary'
                                onClick={() => onNavigate('/posting')}
                            >
                                Create post
                            </Button>
                            <Button
                                variant='neutral'
                                onClick={() => onNavigate('/feed')}
                            >
                                Open live feed
                            </Button>
                        </div>
                    </Panel>
                </section>

                <section className='space-y-6 lg:col-span-2'>
                    <Card title='Service boundaries online'>
                        <ul className='list-disc space-y-1 pl-5 text-sm'>
                            <li>
                                API shell at <code>localhost:4000</code>
                            </li>
                            <li>
                                Indexer shell at <code>localhost:4100</code>
                            </li>
                            <li>
                                Moderation worker shell at{' '}
                                <code>localhost:4200</code>
                            </li>
                        </ul>
                        <p className='mt-3'>
                            See <TextLink href='/'>architecture docs</TextLink>{' '}
                            for bounded contexts and ADR rationale.
                        </p>
                    </Card>

                    <Card title='Quick route handoffs'>
                        <ul className='space-y-3'>
                            {shellSections.map(section => (
                                <li
                                    key={section.route}
                                    className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3'
                                >
                                    <p className='text-sm font-bold text-mh-text'>
                                        {section.title}
                                    </p>
                                    <p className='mt-1 text-xs text-mh-textSoft'>
                                        {section.description}
                                    </p>
                                    <p className='mt-2'>
                                        <button
                                            type='button'
                                            className='mh-link text-sm'
                                            onClick={() =>
                                                onNavigate(section.route)
                                            }
                                        >
                                            Open {section.title}
                                        </button>
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </section>
            </div>

            <CoreFlowSurfaces />
        </>
    );
};

interface MapRouteProps {
    discoveryState: DiscoveryFilterState;
    onPatchDiscovery: (patch: Partial<DiscoveryFilterState>) => void;
    feedRecords: readonly FeedRecordEnvelope[];
    isLoading: boolean;
    errorMessage?: string;
    dataOrigin: ApiDataOrigin;
    selectedPostId?: string;
    onSelectPost: (id: string | undefined) => void;
    onTriageAction: (postId: string, action: MapTriageAction) => void;
    onOpenChat: (record: FeedRecordEnvelope, surface: ChatEntrySurface) => void;
}

const MapRoute = ({
    discoveryState,
    onPatchDiscovery,
    feedRecords,
    isLoading,
    errorMessage,
    dataOrigin,
    selectedPostId,
    onSelectPost,
    onTriageAction,
    onOpenChat,
}: MapRouteProps) => {
    useEffect(() => {
        if (!selectedPostId) {
            return undefined;
        }
        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') {
                onSelectPost(undefined);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedPostId, onSelectPost]);

    const mapCards = useMemo(
        () => feedRecords.map(toMapAidCard),
        [feedRecords],
    );

    const mapView = useMemo(
        () => buildMapViewModel(mapCards, discoveryState),
        [mapCards, discoveryState],
    );

    const selectedRecord =
        selectedPostId ?
            feedRecords.find(record => record.card.id === selectedPostId)
        :   undefined;

    const drawer =
        selectedPostId ?
            openMapDetailDrawer(mapView.filteredCards, selectedPostId)
        :   closeMapDetailDrawer();

    return (
        <section className='space-y-6'>
            <header className='border-b-2 border-mh-border pb-4'>
                <h1 className='font-heading text-3xl font-black uppercase tracking-tight sm:text-4xl'>
                    Map triage
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Approximate-area clustering with privacy-safe radii and
                    direct handoff actions.
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                    <Badge tone={dataOrigin === 'api' ? 'success' : 'info'}>
                        {dataOrigin === 'api' ?
                            'DB-backed API'
                        :   'Fallback dataset'}
                    </Badge>
                </div>
                {errorMessage ?
                    <p className='mh-alert mt-3 text-xs font-bold'>
                        API sync issue: {errorMessage}
                    </p>
                :   null}
            </header>

            <DiscoveryFiltersPanel
                idPrefix='map'
                state={discoveryState}
                onPatch={onPatchDiscovery}
            />

            <div className='grid gap-6 xl:grid-cols-2'>
                <Card title='Cluster overview'>
                    {isLoading ?
                        <ul className='space-y-3' aria-live='polite'>
                            {Array.from({ length: 3 }).map((_, index) => (
                                <li
                                    key={`cluster-skeleton-${index}`}
                                    className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3'
                                >
                                    <div className='mh-skeleton h-4 w-3/4' />
                                    <div className='mh-skeleton mt-2 h-3 w-1/2' />
                                    <div className='mh-skeleton mt-3 h-6 w-24' />
                                </li>
                            ))}
                        </ul>
                    : mapView.clusters.length === 0 ?
                        <p>
                            No clusters for current filters. Try widening radius
                            or clearing category/status chips.
                        </p>
                    :   <ul className='space-y-3'>
                            {mapView.clusters.map(cluster => (
                                <li
                                    key={cluster.id}
                                    className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3'
                                >
                                    <p className='text-sm font-bold text-mh-text'>
                                        {cluster.label}
                                    </p>
                                    <p className='mt-1 text-xs text-mh-textSoft'>
                                        {cluster.count} requests · Max urgency{' '}
                                        {cluster.urgencyMax}
                                    </p>
                                    <div className='mt-2'>
                                        <Badge
                                            tone={toSeverityTone(
                                                cluster.status,
                                            )}
                                        >
                                            {cluster.status}
                                        </Badge>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    }
                </Card>

                <Card title='Request markers'>
                    {isLoading ?
                        <ul className='space-y-3' aria-live='polite'>
                            {Array.from({ length: 3 }).map((_, index) => (
                                <li
                                    key={`marker-skeleton-${index}`}
                                    className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3'
                                >
                                    <div className='mh-skeleton h-4 w-2/3' />
                                    <div className='mh-skeleton mt-2 h-3 w-full' />
                                    <div className='mh-skeleton mt-2 h-3 w-4/5' />
                                    <div className='mh-skeleton mt-3 h-8 w-32' />
                                </li>
                            ))}
                        </ul>
                    : mapView.filteredCards.length === 0 ?
                        <p>
                            No requests in selected area. Set a wider radius or
                            switch to latest feed tab.
                        </p>
                    :   <ul className='space-y-3'>
                            {mapView.filteredCards.map(card => (
                                <li
                                    key={card.id}
                                    className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3'
                                >
                                    <div className='flex flex-wrap items-start justify-between gap-2'>
                                        <p className='text-sm font-bold text-mh-text'>
                                            {card.title}
                                        </p>
                                        <div className='flex flex-wrap gap-2'>
                                            <Badge
                                                tone={toUrgencyTone(
                                                    card.urgency,
                                                )}
                                            >
                                                Urgency {card.urgency}
                                            </Badge>
                                            <Badge
                                                tone={toSeverityTone(
                                                    card.status,
                                                )}
                                            >
                                                {card.status}
                                            </Badge>
                                        </div>
                                    </div>
                                    <p className='mt-2 text-xs text-mh-textSoft'>
                                        {card.summary}
                                    </p>
                                    <div className='mt-3'>
                                        <Button
                                            variant='neutral'
                                            className='px-3 py-1 text-xs'
                                            onClick={() =>
                                                onSelectPost(card.id)
                                            }
                                        >
                                            Open triage drawer
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    }
                </Card>
            </div>

            {drawer.open && selectedRecord ?
                <Panel title='Map detail drawer' aria-label={`Details for ${drawer.title ?? 'selected request'}`}>
                    <p className='text-lg font-bold text-mh-text'>
                        {drawer.title}
                    </p>
                    <p className='mt-1 text-sm text-mh-textMuted'>
                        {drawer.summary}
                    </p>
                    <div className='mt-3 flex flex-wrap gap-2'>
                        {drawer.status ?
                            <Badge tone={toSeverityTone(drawer.status)}>
                                {drawer.status}
                            </Badge>
                        :   null}
                        <Badge tone='info'>{selectedRecord.recipientDid}</Badge>
                    </div>
                    <div className='mt-4 flex flex-wrap gap-2'>
                        {drawer.actions.map(action => (
                            <Button
                                key={action.action}
                                variant={
                                    action.action === 'contact_helper' ?
                                        'primary'
                                    :   'neutral'
                                }
                                className='px-3 py-1 text-xs'
                                aria-label={action.ariaLabel}
                                onClick={() => {
                                    if (action.action === 'contact_helper') {
                                        onOpenChat(selectedRecord, 'map');
                                        return;
                                    }

                                    onTriageAction(
                                        selectedRecord.card.id,
                                        action.action,
                                    );
                                }}
                            >
                                {action.label}
                            </Button>
                        ))}
                        <Button
                            variant='neutral'
                            className='px-3 py-1 text-xs'
                            onClick={() => onSelectPost(undefined)}
                        >
                            Close drawer
                        </Button>
                    </div>
                </Panel>
            :   null}
        </section>
    );
};

const LIFECYCLE_STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    triaged: 'Triaged',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    archived: 'Archived',
};

const LIFECYCLE_STATUS_TONES: Record<
    string,
    'neutral' | 'info' | 'success' | 'danger'
> = {
    open: 'danger',
    triaged: 'info',
    assigned: 'info',
    in_progress: 'info',
    resolved: 'success',
    archived: 'neutral',
};

interface StatusTimelineProps {
    timeline: readonly FeedStatusTransition[];
}

const StatusTimeline = ({ timeline }: StatusTimelineProps) => {
    if (timeline.length === 0) {
        return (
            <p className='text-xs text-mh-textSoft'>
                No lifecycle transitions recorded yet.
            </p>
        );
    }

    return (
        <ol className='space-y-2'>
            {timeline.map((entry, index) => (
                <li
                    key={`${entry.timestamp}-${index}`}
                    className='flex items-start gap-3 border-l-2 border-mh-borderSoft pl-3'
                >
                    <div className='flex-1'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <Badge
                                tone={
                                    LIFECYCLE_STATUS_TONES[entry.from] ??
                                    'neutral'
                                }
                            >
                                {LIFECYCLE_STATUS_LABELS[entry.from] ??
                                    entry.from}
                            </Badge>
                            <span className='text-xs text-mh-textSoft'>
                                {'->'}
                            </span>
                            <Badge
                                tone={
                                    LIFECYCLE_STATUS_TONES[entry.to] ??
                                    'neutral'
                                }
                            >
                                {LIFECYCLE_STATUS_LABELS[entry.to] ?? entry.to}
                            </Badge>
                        </div>
                        <p className='mt-1 text-xs text-mh-textSoft'>
                            {entry.actorRole} ({entry.actorDid}) at{' '}
                            {new Date(entry.timestamp).toLocaleString()}
                        </p>
                        {entry.reason ?
                            <p className='mt-1 text-xs text-mh-textMuted'>
                                Reason: {entry.reason}
                            </p>
                        :   null}
                    </div>
                </li>
            ))}
        </ol>
    );
};

interface FeedRouteProps {
    discoveryState: DiscoveryFilterState;
    onPatchDiscovery: (patch: Partial<DiscoveryFilterState>) => void;
    feedRecords: readonly FeedRecordEnvelope[];
    isLoading: boolean;
    errorMessage?: string;
    dataOrigin: ApiDataOrigin;
    onNavigate: (route: AppRoute) => void;
    onOpenChat: (record: FeedRecordEnvelope, surface: ChatEntrySurface) => void;
    onUpdateCard: (id: string, patch: Partial<Omit<FeedAidCard, 'id'>>) => void;
    onCloseCard: (id: string) => void;
    onTransition?: (
        id: string,
        postUri: string,
        targetStatus: LifecycleStatus,
    ) => void;
}

const FeedRoute = ({
    discoveryState,
    onPatchDiscovery,
    feedRecords,
    isLoading,
    errorMessage,
    dataOrigin,
    onNavigate,
    onOpenChat,
    onUpdateCard,
    onCloseCard,
    onTransition,
}: FeedRouteProps) => {
    const [expandedTimelineId, setExpandedTimelineId] = useState<
        string | undefined
    >();
    const cards = useMemo(
        () => feedRecords.map(record => record.card),
        [feedRecords],
    );
    const feedView = useMemo(
        () => buildFeedViewModel(cards, discoveryState),
        [cards, discoveryState],
    );

    const presentationById = useMemo(
        () =>
            new Map(
                feedView.presentations.map(presentation => [
                    presentation.id,
                    presentation,
                ]),
            ),
        [feedView.presentations],
    );

    return (
        <section className='space-y-6'>
            <header className='border-b-2 border-mh-border pb-4'>
                <h1 className='font-heading text-3xl font-black uppercase tracking-tight sm:text-4xl'>
                    Feed operations
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Manage lifecycle transitions and launch handoffs directly
                    from feed cards.
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                    <Badge tone={dataOrigin === 'api' ? 'success' : 'info'}>
                        {dataOrigin === 'api' ?
                            'DB-backed API'
                        :   'Fallback dataset'}
                    </Badge>
                </div>
                {errorMessage ?
                    <p className='mh-alert mt-3 text-xs font-bold'>
                        API sync issue: {errorMessage}
                    </p>
                :   null}
            </header>

            <DiscoveryFiltersPanel
                idPrefix='feed'
                state={discoveryState}
                onPatch={onPatchDiscovery}
            />

            <Card title='Live request feed'>
                {isLoading ?
                    <ul className='space-y-4' aria-live='polite'>
                        {Array.from({ length: 3 }).map((_, index) => (
                            <li
                                key={`feed-skeleton-${index}`}
                                className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-4'
                            >
                                <div className='mh-skeleton h-5 w-2/3' />
                                <div className='mh-skeleton mt-2 h-3 w-full' />
                                <div className='mh-skeleton mt-2 h-3 w-5/6' />
                                <div className='mt-4 flex gap-2'>
                                    <div className='mh-skeleton h-8 w-28' />
                                    <div className='mh-skeleton h-8 w-32' />
                                </div>
                            </li>
                        ))}
                    </ul>
                : feedView.cards.length === 0 ?
                    <div className='space-y-3'>
                        <p>
                            No requests match the current filters. Reset filters
                            or publish a new request.
                        </p>
                        <div className='flex flex-wrap gap-2'>
                            <Button
                                variant='neutral'
                                className='px-3 py-1 text-xs'
                                onClick={() => {
                                    onPatchDiscovery({
                                        feedTab: 'latest',
                                        text: undefined,
                                        category: undefined,
                                        status: undefined,
                                        minUrgency: undefined,
                                        center: undefined,
                                        radiusMeters: undefined,
                                        since: undefined,
                                    });
                                }}
                            >
                                Reset feed filters
                            </Button>
                            <Button
                                className='px-3 py-1 text-xs'
                                onClick={() => onNavigate('/posting')}
                            >
                                Create request
                            </Button>
                        </div>
                    </div>
                :   <ul className='space-y-4'>
                        {feedView.cards.map(card => {
                            const record = feedRecords.find(
                                candidate => candidate.card.id === card.id,
                            );
                            const presentation = presentationById.get(card.id);

                            return (
                                <li
                                    key={card.id}
                                    className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-4'
                                >
                                    <div className='flex flex-wrap items-start justify-between gap-2'>
                                        <p className='text-base font-bold text-mh-text'>
                                            {card.title}
                                        </p>
                                        <div className='flex flex-wrap gap-2'>
                                            {presentation ?
                                                <>
                                                    <Badge
                                                        tone={
                                                            presentation
                                                                .statusBadge
                                                                .tone
                                                        }
                                                    >
                                                        {
                                                            presentation
                                                                .statusBadge
                                                                .label
                                                        }
                                                    </Badge>
                                                    <Badge
                                                        tone={
                                                            presentation
                                                                .urgencyBadge
                                                                .tone
                                                        }
                                                    >
                                                        {
                                                            presentation
                                                                .urgencyBadge
                                                                .label
                                                        }
                                                    </Badge>
                                                    {presentation.lifecycleBadge ?
                                                        <Badge
                                                            tone={
                                                                presentation
                                                                    .lifecycleBadge
                                                                    .tone
                                                            }
                                                        >
                                                            {
                                                                presentation
                                                                    .lifecycleBadge
                                                                    .label
                                                            }
                                                        </Badge>
                                                    :   null}
                                                </>
                                            :   null}
                                        </div>
                                    </div>

                                    <p className='mt-2 text-sm text-mh-textMuted'>
                                        {card.description}
                                    </p>
                                    <p className='mt-1 text-xs text-mh-textSoft'>
                                        Updated{' '}
                                        {new Date(
                                            card.updatedAt,
                                        ).toLocaleString()}
                                    </p>

                                    {/* Lifecycle transition actions */}
                                    {presentation &&
                                    presentation.transitionActions
                                        .length > 0 &&
                                    onTransition &&
                                    record ?
                                        <div className='mt-3 flex flex-wrap gap-2'>
                                            <span className='text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'>
                                                Lifecycle:
                                            </span>
                                            {presentation.transitionActions.map(
                                                action => (
                                                    <Button
                                                        key={
                                                            action.targetStatus
                                                        }
                                                        variant='neutral'
                                                        className='px-3 py-1 text-xs'
                                                        aria-label={
                                                            action.ariaLabel
                                                        }
                                                        onClick={() =>
                                                            onTransition(
                                                                card.id,
                                                                record.aidPostUri,
                                                                action.targetStatus,
                                                            )
                                                        }
                                                    >
                                                        {action.label}
                                                    </Button>
                                                ),
                                            )}
                                        </div>
                                    :   null}

                                    <div className='mt-4 flex flex-wrap gap-2'>
                                        {record ?
                                            <Button
                                                className='px-3 py-1 text-xs'
                                                onClick={() =>
                                                    onOpenChat(record, 'feed')
                                                }
                                            >
                                                Contact helper
                                            </Button>
                                        :   null}

                                        <Button
                                            variant='secondary'
                                            className='px-3 py-1 text-xs'
                                            onClick={() => {
                                                onUpdateCard(card.id, {
                                                    urgency: Math.min(
                                                        5,
                                                        card.urgency + 1,
                                                    ) as 1 | 2 | 3 | 4 | 5,
                                                    updatedAt: nowIso(),
                                                });
                                            }}
                                            disabled={card.urgency >= 5}
                                        >
                                            Escalate urgency
                                        </Button>

                                        <Button
                                            variant='neutral'
                                            className='px-3 py-1 text-xs'
                                            onClick={() => onCloseCard(card.id)}
                                            disabled={card.status === 'closed'}
                                        >
                                            Close request
                                        </Button>

                                        {/* Timeline toggle */}
                                        {card.timeline &&
                                        card.timeline.length > 0 ?
                                            <Button
                                                variant='neutral'
                                                className='px-3 py-1 text-xs'
                                                onClick={() =>
                                                    setExpandedTimelineId(
                                                        current =>
                                                            current === card.id ?
                                                                undefined
                                                            :   card.id,
                                                    )
                                                }
                                            >
                                                {expandedTimelineId === card.id ?
                                                    'Hide timeline'
                                                :   `Timeline (${card.timeline.length})`}
                                            </Button>
                                        :   null}
                                    </div>

                                    {/* Expanded timeline panel */}
                                    {expandedTimelineId === card.id &&
                                    card.timeline ?
                                        <div className='mt-4 border-t-2 border-mh-borderSoft pt-4'>
                                            <p className='mb-3 text-xs font-bold uppercase tracking-[0.12em] text-mh-textMuted'>
                                                Audit timeline
                                            </p>
                                            <StatusTimeline
                                                timeline={card.timeline}
                                            />
                                        </div>
                                    :   null}
                                </li>
                            );
                        })}
                    </ul>
                }
            </Card>
        </section>
    );
};

interface PostingRouteProps {
    authorDid: string;
    center: { lat: number; lng: number };
    onCreateRecord: (record: FeedRecordEnvelope) => void;
    onNavigate: (route: AppRoute) => void;
    onCreateViaApi: (input: {
        authorDid: string;
        draft: NormalizedAidPostingDraft;
        rkey: string;
        now: string;
    }) => Promise<
        { ok: true; data: FeedRecordEnvelope } | { ok: false; error: string }
    >;
}

const PostingRoute = ({
    authorDid,
    center,
    onCreateRecord,
    onNavigate,
    onCreateViaApi,
}: PostingRouteProps) => {
    const [title, setTitle] = useState('Need urgent support');
    const [description, setDescription] = useState(
        'Describe the request, constraints, and safest handoff instructions.',
    );
    const [category, setCategory] = useState<AidPostingCategory>('food');
    const [urgency, setUrgency] = useState<1 | 2 | 3 | 4 | 5>(4);
    const [tagsText, setTagsText] = useState('wheelchair, quiet-arrival');
    const [lat, setLat] = useState(center.lat.toFixed(4));
    const [lng, setLng] = useState(center.lng.toFixed(4));
    const [precisionMeters, setPrecisionMeters] = useState('450');
    const [startAt, setStartAt] = useState('');
    const [endAt, setEndAt] = useState('');
    const [errors, setErrors] = useState<readonly PostingValidationIssue[]>([]);
    const [successMessage, setSuccessMessage] = useState<string>();
    const [apiError, setApiError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setApiError(undefined);

        const draft = {
            title,
            description,
            category,
            urgency,
            accessibilityTags: parseCommaList(tagsText),
            location: {
                lat: Number.parseFloat(lat),
                lng: Number.parseFloat(lng),
                precisionMeters: Number.parseInt(precisionMeters, 10),
            },
            timeWindow:
                startAt.length > 0 && endAt.length > 0 ?
                    {
                        startAt: new Date(startAt).toISOString(),
                        endAt: new Date(endAt).toISOString(),
                    }
                :   undefined,
        };

        const validation = validatePostingDraft(draft);
        setErrors(validation.errors);

        if (!validation.ok || !validation.normalizedDraft) {
            setSuccessMessage(undefined);
            return;
        }

        const localId = `post-${Date.now().toString(36)}`;
        setIsSubmitting(true);

        try {
            const createResult = await onCreateViaApi({
                authorDid,
                draft: validation.normalizedDraft,
                rkey: localId,
                now: nowIso(),
            });

            if (!createResult.ok) {
                setSuccessMessage(undefined);
                setApiError(createResult.error);
                return;
            }

            onCreateRecord(createResult.data);

            setSuccessMessage(
                `Created post ${localId} and persisted via API/DB.`,
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className='space-y-6'>
            <header className='border-b-2 border-mh-border pb-4'>
                <h1 className='font-heading text-3xl font-black uppercase tracking-tight sm:text-4xl'>
                    Create request
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Shared posting form with taxonomy, accessibility tags, and
                    geoprivacy enforcement.
                </p>
            </header>

            <Panel title='Posting form'>
                <form className='space-y-4' onSubmit={handleSubmit}>
                    <div>
                        <label
                            htmlFor='posting-title'
                            className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                        >
                            Title
                        </label>
                        <Input
                            id='posting-title'
                            value={title}
                            onChange={event => setTitle(event.target.value)}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor='posting-description'
                            className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                        >
                            Description
                        </label>
                        <textarea
                            id='posting-description'
                            className='mh-input min-h-35 w-full px-3 py-2 text-base'
                            value={description}
                            onChange={event =>
                                setDescription(event.target.value)
                            }
                        />
                    </div>

                    <div className='grid gap-4 sm:grid-cols-2'>
                        <div>
                            <label
                                htmlFor='posting-category'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Category
                            </label>
                            <select
                                id='posting-category'
                                className='mh-input w-full px-3 py-2 text-base'
                                value={category}
                                onChange={event =>
                                    setCategory(
                                        event.target
                                            .value as AidPostingCategory,
                                    )
                                }
                            >
                                {aidCategories.map(option => (
                                    <option key={option} value={option}>
                                        {formatCategoryLabel(option)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor='posting-urgency'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Urgency
                            </label>
                            <Input
                                id='posting-urgency'
                                type='number'
                                min={1}
                                max={5}
                                value={urgency}
                                onChange={event => {
                                    const nextUrgency = Number.parseInt(
                                        event.target.value,
                                        10,
                                    );
                                    if (Number.isNaN(nextUrgency)) {
                                        return;
                                    }
                                    setUrgency(
                                        Math.min(
                                            5,
                                            Math.max(1, nextUrgency),
                                        ) as 1 | 2 | 3 | 4 | 5,
                                    );
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor='posting-tags'
                            className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                        >
                            Accessibility tags (comma-separated)
                        </label>
                        <Input
                            id='posting-tags'
                            value={tagsText}
                            onChange={event => setTagsText(event.target.value)}
                        />
                    </div>

                    <div className='grid gap-4 sm:grid-cols-3'>
                        <div>
                            <label
                                htmlFor='posting-lat'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Latitude
                            </label>
                            <Input
                                id='posting-lat'
                                type='number'
                                step='0.0001'
                                value={lat}
                                onChange={event => setLat(event.target.value)}
                            />
                        </div>
                        <div>
                            <label
                                htmlFor='posting-lng'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Longitude
                            </label>
                            <Input
                                id='posting-lng'
                                type='number'
                                step='0.0001'
                                value={lng}
                                onChange={event => setLng(event.target.value)}
                            />
                        </div>
                        <div>
                            <label
                                htmlFor='posting-precision'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Precision meters
                            </label>
                            <Input
                                id='posting-precision'
                                type='number'
                                min={300}
                                value={precisionMeters}
                                onChange={event =>
                                    setPrecisionMeters(event.target.value)
                                }
                            />
                        </div>
                    </div>

                    <div className='grid gap-4 sm:grid-cols-2'>
                        <div>
                            <label
                                htmlFor='posting-start-at'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Time window start
                            </label>
                            <Input
                                id='posting-start-at'
                                type='datetime-local'
                                value={startAt}
                                onChange={event =>
                                    setStartAt(event.target.value)
                                }
                            />
                        </div>
                        <div>
                            <label
                                htmlFor='posting-end-at'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Time window end
                            </label>
                            <Input
                                id='posting-end-at'
                                type='datetime-local'
                                value={endAt}
                                onChange={event => setEndAt(event.target.value)}
                            />
                        </div>
                    </div>

                    {errors.length > 0 ?
                        <div className='space-y-1'>
                            {errors.map(issue => (
                                <p
                                    key={`${issue.field}-${issue.message}`}
                                    className='mh-alert text-xs font-bold'
                                >
                                    {issue.field}: {issue.message}
                                </p>
                            ))}
                        </div>
                    :   null}

                    {successMessage ?
                        <p className='rounded-none border-2 border-mh-border bg-mh-surfaceElev px-3 py-2 text-xs font-bold text-mh-success'>
                            {successMessage}
                        </p>
                    :   null}

                    {apiError ?
                        <p className='mh-alert text-xs font-bold'>
                            Unable to persist request: {apiError}
                        </p>
                    :   null}

                    <div className='flex flex-wrap gap-2'>
                        <Button type='submit' disabled={isSubmitting}>
                            {isSubmitting ? 'Publishing…' : 'Publish request'}
                        </Button>
                        <Button
                            variant='secondary'
                            type='button'
                            onClick={() => onNavigate('/feed')}
                        >
                            Open feed
                        </Button>
                    </div>
                </form>
            </Panel>
        </section>
    );
};

interface ResourceRouteProps {
    discoveryState: DiscoveryFilterState;
    onPatchDiscovery: (patch: Partial<DiscoveryFilterState>) => void;
    onNavigate: (route: AppRoute) => void;
    isLoading: boolean;
    errorMessage?: string;
    dataOrigin: ApiDataOrigin;
    resourceCards: readonly ResourceDirectoryCard[];
}

const ResourceRoute = ({
    discoveryState,
    onPatchDiscovery,
    onNavigate,
    isLoading,
    errorMessage,
    dataOrigin,
    resourceCards,
}: ResourceRouteProps) => {
    const [activeCategory, setActiveCategory] =
        useState<DirectoryResourceCategory>();
    const [selectedUri, setSelectedUri] = useState<string>();

    useEffect(() => {
        if (!selectedUri) {
            return undefined;
        }
        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSelectedUri(undefined);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedUri]);

    const viewModel = useMemo(
        () =>
            buildResourceOverlayViewModel(resourceCards, discoveryState, {
                category: activeCategory,
            }),
        [activeCategory, discoveryState, resourceCards],
    );

    const uiState = useMemo(
        () =>
            resolveResourceDirectoryUiState({
                loading: isLoading,
                errorMessage,
                resources: viewModel.cards,
                activeCategoryFilter: viewModel.activeCategoryFilter,
            }),
        [errorMessage, isLoading, viewModel.cards, viewModel.activeCategoryFilter],
    );

    const detailPanel =
        selectedUri ?
            openResourceDetailPanel(viewModel.cards, selectedUri)
        :   closeResourceDetailPanel();

    return (
        <section className='space-y-6'>
            <header className='border-b-2 border-mh-border pb-4'>
                <h1 className='font-heading text-3xl font-black uppercase tracking-tight sm:text-4xl'>
                    Resource directory
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Overlay verified services on map context and launch intake
                    handoffs quickly.
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                    <Badge tone={dataOrigin === 'api' ? 'success' : 'info'}>
                        {dataOrigin === 'api' ?
                            'DB-backed API'
                        :   'Fallback dataset'}
                    </Badge>
                </div>
                {errorMessage ?
                    <p className='mh-alert mt-3 text-xs font-bold'>
                        API sync issue: {errorMessage}
                    </p>
                :   null}
            </header>

            <DiscoveryFiltersPanel
                idPrefix='resources'
                state={discoveryState}
                onPatch={onPatchDiscovery}
            />

            <Card title='Directory filters'>
                <div className='flex flex-wrap gap-2'>
                    <Button
                        variant={activeCategory ? 'neutral' : 'secondary'}
                        className='px-3 py-1 text-xs'
                        onClick={() => setActiveCategory(undefined)}
                    >
                        All categories
                    </Button>
                    {resourceCategoryOptions.map(category => (
                        <Button
                            key={category}
                            variant={
                                activeCategory === category ? 'secondary' : (
                                    'neutral'
                                )
                            }
                            className='px-3 py-1 text-xs'
                            onClick={() =>
                                setActiveCategory(current =>
                                    current === category ? undefined : category,
                                )
                            }
                        >
                            {formatCategoryLabel(category)}
                        </Button>
                    ))}
                </div>
            </Card>

            <Card title='Overlay + cards'>
                <p className='mb-3 text-sm text-mh-textMuted'>
                    {uiState.message}
                </p>
                <div aria-live='polite' className='sr-only'>
                    {uiState.ariaLiveMessage}
                </div>

                {isLoading ?
                    <ul className='space-y-3' aria-live='polite'>
                        {Array.from({ length: 3 }).map((_, index) => (
                            <li
                                key={`resource-skeleton-${index}`}
                                className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3'
                            >
                                <div className='mh-skeleton h-4 w-1/2' />
                                <div className='mh-skeleton mt-2 h-3 w-2/3' />
                                <div className='mh-skeleton mt-2 h-3 w-full' />
                                <div className='mt-3 flex gap-2'>
                                    <div className='mh-skeleton h-8 w-28' />
                                    <div className='mh-skeleton h-8 w-24' />
                                </div>
                            </li>
                        ))}
                    </ul>
                : viewModel.cards.length === 0 ?
                    <div className='space-y-3'>
                        <p className='text-xs text-mh-textSoft'>
                            Try broadening radius/category filters or switching
                            aid category.
                        </p>
                        <Button
                            variant='neutral'
                            className='px-3 py-1 text-xs'
                            onClick={() => setActiveCategory(undefined)}
                        >
                            Clear directory category
                        </Button>
                    </div>
                :   <ul className='space-y-3'>
                        {viewModel.cards.map(card => (
                            <li
                                key={card.uri}
                                className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3'
                            >
                                <div className='flex flex-wrap items-start justify-between gap-2'>
                                    <p className='text-sm font-bold text-mh-text'>
                                        {card.name}
                                    </p>
                                    <Badge tone='info'>
                                        {formatCategoryLabel(card.category)}
                                    </Badge>
                                </div>
                                <p className='mt-1 text-xs text-mh-textSoft'>
                                    {card.location.areaLabel ?? 'Area pending'}{' '}
                                    · {card.openHours ?? 'Hours unavailable'}
                                </p>
                                <p className='mt-2 text-sm text-mh-textMuted'>
                                    {card.eligibilityNotes ??
                                        'Eligibility details unavailable.'}
                                </p>
                                <div className='mt-3 flex flex-wrap gap-2'>
                                    <Button
                                        variant='neutral'
                                        className='px-3 py-1 text-xs'
                                        onClick={() => setSelectedUri(card.uri)}
                                    >
                                        Open details
                                    </Button>
                                    <Button
                                        variant='secondary'
                                        className='px-3 py-1 text-xs'
                                        onClick={() => onNavigate('/posting')}
                                    >
                                        Start intake
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                }
            </Card>

            {detailPanel.open ?
                <Panel title='Resource detail'>
                    <p className='text-lg font-bold text-mh-text'>
                        {detailPanel.title}
                    </p>
                    <p className='mt-1 text-sm text-mh-textMuted'>
                        {detailPanel.categoryLabel} · {detailPanel.openHours}
                    </p>
                    <p className='mt-2 text-sm text-mh-textSoft'>
                        {detailPanel.eligibilityNotes}
                    </p>
                    <div className='mt-4 flex flex-wrap gap-2'>
                        {detailPanel.actions.map(action => (
                            <Button
                                key={action.id}
                                variant={
                                    action.id === 'request_intake' ?
                                        'primary'
                                    :   'neutral'
                                }
                                className='px-3 py-1 text-xs'
                                onClick={() => {
                                    if (action.id === 'request_intake') {
                                        onNavigate('/posting');
                                        return;
                                    }

                                    if (action.id === 'open_map') {
                                        onNavigate('/map');
                                        return;
                                    }
                                }}
                            >
                                {action.label}
                            </Button>
                        ))}
                        <Button
                            variant='neutral'
                            className='px-3 py-1 text-xs'
                            onClick={() => setSelectedUri(undefined)}
                        >
                            Close
                        </Button>
                    </div>
                </Panel>
            :   null}
        </section>
    );
};

const toggleInList = <TValue extends string>(
    list: readonly TValue[],
    value: TValue,
): TValue[] => {
    if (list.includes(value)) {
        return list.filter(item => item !== value);
    }

    return [...list, value];
};

const VolunteerRoute = () => {
    const [draft, setDraft] = useState<VolunteerOnboardingDraft>(
        defaultVolunteerDraft,
    );
    const [skillsText, setSkillsText] = useState(
        defaultVolunteerDraft.skills.join(', '),
    );
    const [windowsText, setWindowsText] = useState(
        defaultVolunteerDraft.availabilityWindows.join(', '),
    );
    const [errors, setErrors] = useState<
        readonly VolunteerOnboardingValidationIssue[]
    >([]);
    const [savedSummary, setSavedSummary] =
        useState<ReturnType<typeof summarizeCheckpoints>>();
    const [isVerified, setIsVerified] = useState<boolean>();

    const candidateDraft = useMemo(
        () => ({
            ...draft,
            skills: parseCommaList(skillsText),
            availabilityWindows: parseCommaList(windowsText),
        }),
        [draft, skillsText, windowsText],
    );

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const validation = validateVolunteerOnboardingDraft(candidateDraft);
        setErrors(validation.errors);

        if (!validation.ok) {
            setSavedSummary(undefined);
            setIsVerified(undefined);
            return;
        }

        const payload = buildVolunteerProfileCreatePayload(candidateDraft, {
            now: nowIso(),
        });

        setSavedSummary(payload.checkpointSummary);
        setIsVerified(isVolunteerFullyVerified(candidateDraft.checkpoints));
        setDraft(candidateDraft);
    };

    return (
        <section className='space-y-6'>
            <header className='border-b-2 border-mh-border pb-4'>
                <h1 className='font-heading text-3xl font-black uppercase tracking-tight sm:text-4xl'>
                    Volunteer onboarding
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Capture capabilities, availability, and verification
                    checkpoints for safe matching.
                </p>
            </header>

            <Panel title='Volunteer profile draft'>
                <form className='space-y-4' onSubmit={handleSubmit}>
                    <div className='grid gap-4 sm:grid-cols-2'>
                        <div>
                            <label
                                htmlFor='volunteer-did'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                DID
                            </label>
                            <Input
                                id='volunteer-did'
                                value={draft.did}
                                onChange={event =>
                                    setDraft(current => ({
                                        ...current,
                                        did: event.target.value,
                                    }))
                                }
                            />
                        </div>
                        <div>
                            <label
                                htmlFor='volunteer-display-name'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Display name
                            </label>
                            <Input
                                id='volunteer-display-name'
                                value={draft.displayName}
                                onChange={event =>
                                    setDraft(current => ({
                                        ...current,
                                        displayName: event.target.value,
                                    }))
                                }
                            />
                        </div>
                    </div>

                    <div className='grid gap-4 sm:grid-cols-2'>
                        <div>
                            <label
                                htmlFor='volunteer-availability'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Availability
                            </label>
                            <select
                                id='volunteer-availability'
                                className='mh-input w-full px-3 py-2 text-base'
                                value={draft.availability}
                                onChange={event =>
                                    setDraft(current => ({
                                        ...current,
                                        availability: event.target
                                            .value as VolunteerOnboardingDraft['availability'],
                                    }))
                                }
                            >
                                {volunteerAvailabilityOptions.map(option => (
                                    <option key={option} value={option}>
                                        {formatCategoryLabel(option)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label
                                htmlFor='volunteer-contact-preference'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Contact preference
                            </label>
                            <select
                                id='volunteer-contact-preference'
                                className='mh-input w-full px-3 py-2 text-base'
                                value={draft.contactPreference}
                                onChange={event =>
                                    setDraft(current => ({
                                        ...current,
                                        contactPreference: event.target
                                            .value as VolunteerOnboardingDraft['contactPreference'],
                                    }))
                                }
                            >
                                {volunteerContactOptions.map(option => (
                                    <option key={option} value={option}>
                                        {formatCategoryLabel(option)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <p className='mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mh-text'>
                            Capabilities
                        </p>
                        <div className='flex flex-wrap gap-2'>
                            {volunteerCapabilityOptions.map(capability => (
                                <Button
                                    key={capability}
                                    variant={
                                        (
                                            draft.capabilities.includes(
                                                capability,
                                            )
                                        ) ?
                                            'secondary'
                                        :   'neutral'
                                    }
                                    className='px-3 py-1 text-xs'
                                    onClick={() =>
                                        setDraft(current => ({
                                            ...current,
                                            capabilities: toggleInList(
                                                current.capabilities,
                                                capability,
                                            ) as VolunteerOnboardingDraft['capabilities'],
                                        }))
                                    }
                                >
                                    {formatCategoryLabel(capability)}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className='grid gap-4 sm:grid-cols-2'>
                        <div>
                            <label
                                htmlFor='volunteer-skills'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Skills (comma-separated)
                            </label>
                            <Input
                                id='volunteer-skills'
                                value={skillsText}
                                onChange={event =>
                                    setSkillsText(event.target.value)
                                }
                            />
                        </div>
                        <div>
                            <label
                                htmlFor='volunteer-windows'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Availability windows
                            </label>
                            <Input
                                id='volunteer-windows'
                                value={windowsText}
                                onChange={event =>
                                    setWindowsText(event.target.value)
                                }
                            />
                        </div>
                    </div>

                    <div>
                        <p className='mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mh-text'>
                            Preferred categories
                        </p>
                        <div className='flex flex-wrap gap-2'>
                            {aidCategories.map(category => (
                                <Button
                                    key={category}
                                    variant={
                                        (
                                            draft.preferredCategories.includes(
                                                category,
                                            )
                                        ) ?
                                            'secondary'
                                        :   'neutral'
                                    }
                                    className='px-3 py-1 text-xs'
                                    onClick={() =>
                                        setDraft(current => ({
                                            ...current,
                                            preferredCategories: toggleInList(
                                                current.preferredCategories,
                                                category,
                                            ) as VolunteerOnboardingDraft['preferredCategories'],
                                        }))
                                    }
                                >
                                    {formatCategoryLabel(category)}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className='mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mh-text'>
                            Preferred urgencies
                        </p>
                        <div className='flex flex-wrap gap-2'>
                            {urgencyPreferenceOptions.map(urgency => (
                                <Button
                                    key={urgency}
                                    variant={
                                        (
                                            draft.preferredUrgencies.includes(
                                                urgency,
                                            )
                                        ) ?
                                            'secondary'
                                        :   'neutral'
                                    }
                                    className='px-3 py-1 text-xs'
                                    onClick={() =>
                                        setDraft(current => ({
                                            ...current,
                                            preferredUrgencies: toggleInList(
                                                current.preferredUrgencies,
                                                urgency,
                                            ) as VolunteerOnboardingDraft['preferredUrgencies'],
                                        }))
                                    }
                                >
                                    {formatCategoryLabel(urgency)}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className='grid gap-4 sm:grid-cols-2'>
                        <div>
                            <label
                                htmlFor='volunteer-distance'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Max distance (km)
                            </label>
                            <Input
                                id='volunteer-distance'
                                type='number'
                                min={1}
                                max={250}
                                value={draft.maxDistanceKm}
                                onChange={event => {
                                    const value = Number.parseInt(
                                        event.target.value,
                                        10,
                                    );
                                    if (Number.isNaN(value)) {
                                        return;
                                    }
                                    setDraft(current => ({
                                        ...current,
                                        maxDistanceKm: value,
                                    }));
                                }}
                            />
                        </div>
                        <div className='flex items-end'>
                            <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                                <input
                                    type='checkbox'
                                    className='h-4 w-4'
                                    checked={draft.acceptsLateNight}
                                    onChange={event =>
                                        setDraft(current => ({
                                            ...current,
                                            acceptsLateNight:
                                                event.target.checked,
                                        }))
                                    }
                                />
                                Accept late-night handoffs
                            </label>
                        </div>
                    </div>

                    <div className='grid gap-4 sm:grid-cols-3'>
                        <div>
                            <label
                                htmlFor='checkpoint-identity'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Identity check
                            </label>
                            <select
                                id='checkpoint-identity'
                                className='mh-input w-full px-3 py-2 text-base'
                                value={draft.checkpoints.identityCheck}
                                onChange={event =>
                                    setDraft(current => ({
                                        ...current,
                                        checkpoints: {
                                            ...current.checkpoints,
                                            identityCheck: event.target
                                                .value as VolunteerOnboardingDraft['checkpoints']['identityCheck'],
                                        },
                                    }))
                                }
                            >
                                {checkpointStatusOptions.map(status => (
                                    <option key={status} value={status}>
                                        {formatCategoryLabel(status)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label
                                htmlFor='checkpoint-safety'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Safety training
                            </label>
                            <select
                                id='checkpoint-safety'
                                className='mh-input w-full px-3 py-2 text-base'
                                value={draft.checkpoints.safetyTraining}
                                onChange={event =>
                                    setDraft(current => ({
                                        ...current,
                                        checkpoints: {
                                            ...current.checkpoints,
                                            safetyTraining: event.target
                                                .value as VolunteerOnboardingDraft['checkpoints']['safetyTraining'],
                                        },
                                    }))
                                }
                            >
                                {checkpointStatusOptions.map(status => (
                                    <option key={status} value={status}>
                                        {formatCategoryLabel(status)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label
                                htmlFor='checkpoint-reference'
                                className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                            >
                                Community reference
                            </label>
                            <select
                                id='checkpoint-reference'
                                className='mh-input w-full px-3 py-2 text-base'
                                value={draft.checkpoints.communityReference}
                                onChange={event =>
                                    setDraft(current => ({
                                        ...current,
                                        checkpoints: {
                                            ...current.checkpoints,
                                            communityReference: event.target
                                                .value as VolunteerOnboardingDraft['checkpoints']['communityReference'],
                                        },
                                    }))
                                }
                            >
                                {checkpointStatusOptions.map(status => (
                                    <option key={status} value={status}>
                                        {formatCategoryLabel(status)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {errors.length > 0 ?
                        <div className='space-y-1'>
                            {errors.map(issue => (
                                <p
                                    key={`${issue.field}-${issue.message}`}
                                    className='mh-alert text-xs font-bold'
                                >
                                    {issue.field}: {issue.message}
                                </p>
                            ))}
                        </div>
                    :   null}

                    {savedSummary ?
                        <div className='rounded-none border-2 border-mh-border bg-mh-surfaceElev p-3'>
                            <div className='flex flex-wrap gap-2'>
                                <Badge tone='success'>
                                    Approved {savedSummary.approved}
                                </Badge>
                                <Badge tone='info'>
                                    Pending {savedSummary.pending}
                                </Badge>
                                <Badge tone='danger'>
                                    Rejected {savedSummary.rejected}
                                </Badge>
                                {isVerified ?
                                    <Badge tone='success'>Fully verified</Badge>
                                :   null}
                            </div>
                        </div>
                    :   null}

                    <Button type='submit'>Save volunteer profile</Button>
                </form>
            </Panel>
        </section>
    );
};

interface ChatRouteProps {
    currentUserDid: string;
    hasPermission: boolean;
    onTogglePermission: (enabled: boolean) => void;
    forceFallback: boolean;
    onToggleFallback: (enabled: boolean) => void;
    intent?: ChatInitiationIntent;
    state: ChatLaunchState;
    requestPreview?: string;
    onLaunch: () => void;
    onReset: () => void;
}

const ChatRoute = ({
    currentUserDid,
    hasPermission,
    onTogglePermission,
    forceFallback,
    onToggleFallback,
    intent,
    state,
    requestPreview,
    onLaunch,
    onReset,
}: ChatRouteProps) => {
    const notice = toChatStatusNotice(state);

    const noticeTone =
        notice?.tone === 'danger' ? 'danger'
        : notice?.tone === 'warning' ? 'info'
        : notice?.tone === 'success' ? 'success'
        : 'neutral';

    return (
        <section className='space-y-6'>
            <header className='border-b-2 border-mh-border pb-4'>
                <h1 className='font-heading text-3xl font-black uppercase tracking-tight sm:text-4xl'>
                    Chat handoff
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Post-linked 1:1 initiation with permission checks and
                    recipient-capability fallback handling.
                </p>
            </header>

            <Panel title='Launch controls'>
                <div className='grid gap-3 sm:grid-cols-2'>
                    <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                        <input
                            type='checkbox'
                            className='h-4 w-4'
                            checked={hasPermission}
                            onChange={event =>
                                onTogglePermission(event.target.checked)
                            }
                        />
                        Initiator has permission
                    </label>
                    <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                        <input
                            type='checkbox'
                            className='h-4 w-4'
                            checked={forceFallback}
                            onChange={event =>
                                onToggleFallback(event.target.checked)
                            }
                        />
                        Force capability fallback
                    </label>
                </div>

                <p className='mt-3 break-all text-xs text-mh-textSoft'>
                    Initiator DID: {currentUserDid}
                </p>

                {intent ?
                    <div className='mt-4 rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3'>
                        <p className='text-sm font-bold text-mh-text'>
                            Pending intent · {intent.aidPostTitle}
                        </p>
                        <p className='mt-1 break-all text-xs text-mh-textSoft'>
                            Recipient: {intent.recipientDid} · Source:{' '}
                            {intent.initiatedFrom}
                        </p>
                    </div>
                :   <p className='mt-4 text-sm text-mh-textMuted'>
                        No pending chat intent. Start from Map or Feed “Contact
                        helper”.
                    </p>
                }

                <div className='mt-4 flex flex-wrap gap-2'>
                    <Button onClick={onLaunch} disabled={!intent}>
                        Launch handoff chat
                    </Button>
                    <Button variant='neutral' onClick={onReset}>
                        Reset state
                    </Button>
                </div>
            </Panel>

            <Card title='Launch status'>
                <p className='text-sm text-mh-textMuted'>
                    State: {state.status}
                </p>

                {notice ?
                    <div className='mt-3'>
                        <Badge tone={noticeTone}>{notice.message}</Badge>
                    </div>
                :   null}

                {requestPreview ?
                    <pre className='mt-3 max-w-full overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3 text-xs text-mh-text'>
                        {requestPreview}
                    </pre>
                :   null}
            </Card>
        </section>
    );
};

interface SettingsRouteProps {
    currentUserDid: string;
}

const SettingsRoute = ({ currentUserDid }: SettingsRouteProps) => {
    const [settings, setSettings] = useState<UserSettings>(
        defaultSettingsViewModel.settings,
    );
    const [savedSettings, setSavedSettings] = useState<UserSettings>(
        defaultSettingsViewModel.settings,
    );
    const [activeSection, setActiveSection] =
        useState<SettingsSection>('privacy');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string>();
    const [saveSuccess, setSaveSuccess] = useState<string>();
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    const [auditEntries, setAuditEntries] = useState<
        readonly { field: string; oldValue: unknown; newValue: unknown; timestamp: string; actor: string }[]
    >([]);
    const [isLoadingAudit, setIsLoadingAudit] = useState(false);
    const [accountActionResult, setAccountActionResult] = useState<string>();

    const dirty = useMemo(
        () => isSettingsDirty(settings, savedSettings),
        [settings, savedSettings],
    );

    useEffect(() => {
        const controller = new AbortController();
        setIsLoadingSettings(true);

        void fetchSettingsFromApi(currentUserDid, controller.signal)
            .then(result => {
                if (controller.signal.aborted) {
                    return;
                }
                if (result.ok) {
                    setSettings(result.data.settings);
                    setSavedSettings(result.data.settings);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoadingSettings(false);
                }
            });

        return () => {
            controller.abort();
        };
    }, [currentUserDid]);

    const handlePatch = (patch: SettingsPatch) => {
        setSettings(current => applySettingsPatch(current, patch));
        setSaveSuccess(undefined);
        setSaveError(undefined);
    };

    const handleSave = async () => {
        const validation = validateSettings(settings);
        if (!validation.ok) {
            setSaveError(validation.errors.join('; '));
            return;
        }

        setIsSaving(true);
        setSaveError(undefined);
        setSaveSuccess(undefined);

        const result = await updateSettingsViaApi(currentUserDid, settings);
        setIsSaving(false);

        if (!result.ok) {
            setSaveError(result.error);
            return;
        }

        setSavedSettings(result.data.settings);
        setSettings(result.data.settings);
        setSaveSuccess(
            `Settings saved. ${result.data.changesRecorded} change(s) recorded.`,
        );
    };

    const handleCancel = () => {
        setSettings(savedSettings);
        setSaveError(undefined);
        setSaveSuccess(undefined);
    };

    const handleLoadAudit = async () => {
        setIsLoadingAudit(true);
        const result = await fetchSettingsAuditFromApi(currentUserDid);
        setIsLoadingAudit(false);

        if (result.ok) {
            setAuditEntries(result.data.entries);
        }
    };

    const handleDeactivate = async () => {
        setAccountActionResult(undefined);
        const result = await deactivateAccountViaApi(
            currentUserDid,
            'User-initiated deactivation',
        );

        if (result.ok) {
            setAccountActionResult(result.data.message);
        } else {
            setAccountActionResult(`Error: ${result.error}`);
        }
    };

    const handleExport = async () => {
        setAccountActionResult(undefined);
        const result = await exportDataViaApi(
            currentUserDid,
            'User-initiated export',
        );

        if (result.ok) {
            setAccountActionResult(result.data.message);
        } else {
            setAccountActionResult(`Error: ${result.error}`);
        }
    };

    return (
        <section className='space-y-6'>
            <header className='border-b-2 border-mh-border pb-4'>
                <h1 className='font-heading text-3xl font-black uppercase tracking-tight sm:text-4xl'>
                    Account settings
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Privacy controls, contact preferences, notifications, and
                    account management.
                </p>
                {dirty ?
                    <div className='mt-3'>
                        <Badge tone='info'>Unsaved changes</Badge>
                    </div>
                :   null}
            </header>

            {/* Section tabs */}
            <div className='flex flex-wrap gap-2'>
                {settingsSections.map(section => (
                    <Button
                        key={section}
                        variant={
                            activeSection === section ? 'secondary' : 'neutral'
                        }
                        className='px-3 py-1 text-xs'
                        onClick={() => setActiveSection(section)}
                    >
                        {settingsSectionLabels[section]}
                    </Button>
                ))}
            </div>

            <p className='text-sm text-mh-textMuted'>
                {settingsSectionDescriptions[activeSection]}
            </p>

            {isLoadingSettings ?
                <Panel title='Loading settings'>
                    <div className='space-y-3'>
                        <div className='mh-skeleton h-4 w-3/4' />
                        <div className='mh-skeleton h-4 w-1/2' />
                        <div className='mh-skeleton h-4 w-2/3' />
                    </div>
                </Panel>
            :   null}

            {/* Privacy section */}
            {!isLoadingSettings && activeSection === 'privacy' ?
                <Panel title='Privacy controls'>
                    <div className='space-y-4'>
                        <div>
                            <p className='mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mh-text'>
                                Privacy level
                            </p>
                            <div className='flex flex-wrap gap-2'>
                                {privacyLevels.map(level => (
                                    <Button
                                        key={level}
                                        variant={
                                            settings.privacyLevel === level ?
                                                'secondary'
                                            :   'neutral'
                                        }
                                        className='px-3 py-1 text-xs'
                                        onClick={() =>
                                            handlePatch({
                                                section: 'privacy',
                                                field: 'privacyLevel',
                                                value: level,
                                            })
                                        }
                                    >
                                        {formatCategoryLabel(level)}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                                <input
                                    type='checkbox'
                                    className='h-4 w-4'
                                    checked={settings.geoSharingEnabled}
                                    onChange={event =>
                                        handlePatch({
                                            section: 'privacy',
                                            field: 'geoSharingEnabled',
                                            value: event.target.checked,
                                        })
                                    }
                                />
                                Enable geo-sharing
                            </label>
                        </div>

                        <div>
                            <p className='mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mh-text'>
                                Geo-sharing precision
                            </p>
                            <div className='flex flex-wrap gap-2'>
                                {geoSharingPrecisions.map(precision => (
                                    <Button
                                        key={precision}
                                        variant={
                                            settings.geoSharingPrecision ===
                                            precision ?
                                                'secondary'
                                            :   'neutral'
                                        }
                                        className='px-3 py-1 text-xs'
                                        onClick={() =>
                                            handlePatch({
                                                section: 'privacy',
                                                field: 'geoSharingPrecision',
                                                value: precision,
                                            })
                                        }
                                    >
                                        {formatCategoryLabel(precision)}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </Panel>
            :   null}

            {/* Contact section */}
            {!isLoadingSettings && activeSection === 'contact' ?
                <Panel title='Contact preferences'>
                    <div className='space-y-3'>
                        <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                            <input
                                type='checkbox'
                                className='h-4 w-4'
                                checked={
                                    settings.contactPreferences
                                        .allowDirectMessages
                                }
                                onChange={event =>
                                    handlePatch({
                                        section: 'contact',
                                        field: 'allowDirectMessages',
                                        value: event.target.checked,
                                    })
                                }
                            />
                            Allow direct messages
                        </label>
                        <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                            <input
                                type='checkbox'
                                className='h-4 w-4'
                                checked={settings.contactPreferences.showEmail}
                                onChange={event =>
                                    handlePatch({
                                        section: 'contact',
                                        field: 'showEmail',
                                        value: event.target.checked,
                                    })
                                }
                            />
                            Show email on profile
                        </label>
                        <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                            <input
                                type='checkbox'
                                className='h-4 w-4'
                                checked={settings.contactPreferences.showPhone}
                                onChange={event =>
                                    handlePatch({
                                        section: 'contact',
                                        field: 'showPhone',
                                        value: event.target.checked,
                                    })
                                }
                            />
                            Show phone on profile
                        </label>
                    </div>
                </Panel>
            :   null}

            {/* Notifications section */}
            {!isLoadingSettings && activeSection === 'notifications' ?
                <Panel title='Notification preferences'>
                    <div className='space-y-3'>
                        <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                            <input
                                type='checkbox'
                                className='h-4 w-4'
                                checked={
                                    settings.notificationPreferences
                                        .aidRequestUpdates
                                }
                                onChange={event =>
                                    handlePatch({
                                        section: 'notifications',
                                        field: 'aidRequestUpdates',
                                        value: event.target.checked,
                                    })
                                }
                            />
                            Aid request updates
                        </label>
                        <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                            <input
                                type='checkbox'
                                className='h-4 w-4'
                                checked={
                                    settings.notificationPreferences
                                        .chatMessages
                                }
                                onChange={event =>
                                    handlePatch({
                                        section: 'notifications',
                                        field: 'chatMessages',
                                        value: event.target.checked,
                                    })
                                }
                            />
                            Chat messages
                        </label>
                        <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                            <input
                                type='checkbox'
                                className='h-4 w-4'
                                checked={
                                    settings.notificationPreferences
                                        .volunteerMatches
                                }
                                onChange={event =>
                                    handlePatch({
                                        section: 'notifications',
                                        field: 'volunteerMatches',
                                        value: event.target.checked,
                                    })
                                }
                            />
                            Volunteer matches
                        </label>
                        <label className='inline-flex items-center gap-2 text-sm text-mh-textMuted'>
                            <input
                                type='checkbox'
                                className='h-4 w-4'
                                checked={
                                    settings.notificationPreferences
                                        .systemAnnouncements
                                }
                                onChange={event =>
                                    handlePatch({
                                        section: 'notifications',
                                        field: 'systemAnnouncements',
                                        value: event.target.checked,
                                    })
                                }
                            />
                            System announcements
                        </label>
                    </div>
                </Panel>
            :   null}

            {/* Account section */}
            {!isLoadingSettings && activeSection === 'account' ?
                <Panel title='Account management'>
                    <div className='space-y-4'>
                        <Card title='Data export'>
                            <p className='text-sm text-mh-textMuted'>
                                Request a full export of your account data
                                including aid posts, conversations, and profile
                                information.
                            </p>
                            <div className='mt-3'>
                                <Button
                                    variant='secondary'
                                    className='px-3 py-1 text-xs'
                                    onClick={handleExport}
                                >
                                    Request data export
                                </Button>
                            </div>
                        </Card>

                        <Card title='Account deactivation'>
                            <p className='text-sm text-mh-textMuted'>
                                Deactivating your account will hide your profile
                                and all posts. This can be reversed within 30
                                days.
                            </p>
                            <div className='mt-3'>
                                <Button
                                    variant='neutral'
                                    className='px-3 py-1 text-xs'
                                    onClick={handleDeactivate}
                                >
                                    Deactivate account
                                </Button>
                            </div>
                        </Card>

                        {accountActionResult ?
                            <p className='rounded-none border-2 border-mh-border bg-mh-surfaceElev px-3 py-2 text-xs font-bold text-mh-success'>
                                {accountActionResult}
                            </p>
                        :   null}

                        <Card title='Audit trail'>
                            <p className='text-sm text-mh-textMuted'>
                                View a log of all settings changes made to your
                                account.
                            </p>
                            <div className='mt-3'>
                                <Button
                                    variant='neutral'
                                    className='px-3 py-1 text-xs'
                                    onClick={handleLoadAudit}
                                    disabled={isLoadingAudit}
                                >
                                    {isLoadingAudit ?
                                        'Loading...'
                                    :   'Load audit trail'}
                                </Button>
                            </div>

                            {auditEntries.length > 0 ?
                                <ul className='mt-3 space-y-2'>
                                    {auditEntries.map((entry, index) => (
                                        <li
                                            key={`audit-${index}-${entry.field}`}
                                            className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-2 text-xs'
                                        >
                                            <p className='font-bold text-mh-text'>
                                                {entry.field}
                                            </p>
                                            <p className='text-mh-textSoft'>
                                                {String(entry.oldValue)} →{' '}
                                                {String(entry.newValue)}
                                            </p>
                                            <p className='text-mh-textSoft'>
                                                {new Date(
                                                    entry.timestamp,
                                                ).toLocaleString()}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            :   null}
                        </Card>
                    </div>
                </Panel>
            :   null}

            {/* Save / Cancel bar */}
            {!isLoadingSettings && activeSection !== 'account' ?
                <div className='flex flex-wrap items-center gap-3'>
                    <Button
                        onClick={handleSave}
                        disabled={!dirty || isSaving}
                    >
                        {isSaving ? 'Saving...' : 'Save settings'}
                    </Button>
                    <Button
                        variant='neutral'
                        onClick={handleCancel}
                        disabled={!dirty}
                    >
                        Cancel
                    </Button>
                    {saveError ?
                        <p className='mh-alert text-xs font-bold'>
                            {saveError}
                        </p>
                    :   null}
                    {saveSuccess ?
                        <p className='text-xs font-bold text-mh-success'>
                            {saveSuccess}
                        </p>
                    :   null}
                </div>
            :   null}
        </section>
    );
};

export const FrontendShell = ({ appTitle }: FrontendShellProps) => {
    const mainContentRef = useRef<HTMLDivElement>(null);
    const [currentRoute, setCurrentRoute] = useState<AppRoute>(() =>
        readCurrentRoute(),
    );

    const [discoveryState, setDiscoveryState] = useState<DiscoveryFilterState>(
        () => readDiscoveryStateFromUrl(defaultShellDiscoveryState),
    );

    const [feedRecords, setFeedRecords] =
        useState<FeedRecordEnvelope[]>(initialFeedRecords);
    const [resourceCards, setResourceCards] =
        useState<ResourceDirectoryCard[]>(initialResourceCards);
    const [isAidLoading, setIsAidLoading] = useState(false);
    const [isDirectoryLoading, setIsDirectoryLoading] = useState(false);
    const [aidErrorMessage, setAidErrorMessage] = useState<string>();
    const [directoryErrorMessage, setDirectoryErrorMessage] =
        useState<string>();
    const [aidDataOrigin, setAidDataOrigin] =
        useState<ApiDataOrigin>('fallback');
    const [directoryDataOrigin, setDirectoryDataOrigin] =
        useState<ApiDataOrigin>('fallback');
    const [selectedMapPostId, setSelectedMapPostId] = useState<string>();
    const [chatIntent, setChatIntent] = useState<ChatInitiationIntent>();
    const [chatState, setChatState] = useState<ChatLaunchState>(
        defaultChatLaunchState,
    );
    const [hasChatPermission, setHasChatPermission] = useState(true);
    const [forceChatFallback, setForceChatFallback] = useState(false);
    const [chatRequestPreview, setChatRequestPreview] = useState<string>();

    const currentUserDid = 'did:example:helper-001';

    const discoveryQueryString = useMemo(
        () => serializeDiscoveryFilterState(discoveryState),
        [discoveryState],
    );

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handlePopState = () => {
            setCurrentRoute(readCurrentRoute());
            setDiscoveryState(
                readDiscoveryStateFromUrl(defaultShellDiscoveryState),
            );
            setSelectedMapPostId(undefined);
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const nextUrl = `${currentRoute}${discoveryQueryString}`;
        const currentUrl = `${window.location.pathname}${window.location.search}`;

        if (nextUrl !== currentUrl) {
            window.history.replaceState({}, '', nextUrl);
        }
    }, [currentRoute, discoveryQueryString]);

    useEffect(() => {
        if (currentRoute !== '/map' && currentRoute !== '/feed') {
            return undefined;
        }

        const controller = new AbortController();
        setIsAidLoading(true);
        setAidErrorMessage(undefined);

        void fetchFeedRecordsFromApi(
            discoveryState,
            currentRoute === '/map' ? 'map' : 'feed',
            controller.signal,
        )
            .then(result => {
                if (controller.signal.aborted) {
                    return;
                }

                if (result.ok) {
                    setFeedRecords(result.data);
                    setAidDataOrigin('api');
                    return;
                }

                setAidDataOrigin('fallback');
                setAidErrorMessage(result.error);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsAidLoading(false);
                }
            });

        return () => {
            controller.abort();
        };
    }, [currentRoute, discoveryState]);

    useEffect(() => {
        if (currentRoute !== '/resources') {
            return undefined;
        }

        const controller = new AbortController();
        setIsDirectoryLoading(true);
        setDirectoryErrorMessage(undefined);

        void fetchDirectoryCardsFromApi(discoveryState, controller.signal)
            .then(result => {
                if (controller.signal.aborted) {
                    return;
                }

                if (result.ok) {
                    setResourceCards(result.data);
                    setDirectoryDataOrigin('api');
                    return;
                }

                setDirectoryDataOrigin('fallback');
                setDirectoryErrorMessage(result.error);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsDirectoryLoading(false);
                }
            });

        return () => {
            controller.abort();
        };
    }, [currentRoute, discoveryState]);

    const navigate = (route: AppRoute) => {
        if (typeof window !== 'undefined') {
            const nextUrl = `${route}${discoveryQueryString}`;
            const currentUrl = `${window.location.pathname}${window.location.search}`;

            if (nextUrl !== currentUrl) {
                window.history.pushState({}, '', nextUrl);
            }
        }

        setCurrentRoute(route);
        ariaLive.routeChange(routeLabels[route]);
    };

    const handleRouteClick = (
        event: MouseEvent<HTMLAnchorElement>,
        route: AppRoute,
    ) => {
        event.preventDefault();
        navigate(route);
    };

    const patchDiscoveryState = (patch: Partial<DiscoveryFilterState>) => {
        setDiscoveryState(current => applyDiscoveryFilterPatch(current, patch));
    };

    const applyLifecycleAction = (action: FeedLifecycleAction) => {
        setFeedRecords(current => {
            const currentCards = current.map(record => record.card);
            const nextCards = applyFeedLifecycleAction(currentCards, action);
            const currentById = new Map(
                current.map(record => [record.card.id, record]),
            );

            return nextCards.map(card => {
                const existing = currentById.get(card.id);
                if (existing) {
                    return {
                        ...existing,
                        card,
                    };
                }

                return {
                    aidPostUri: `at://${currentUserDid}/app.patchwork.aid.post/${card.id}`,
                    recipientDid: currentUserDid,
                    card,
                } satisfies FeedRecordEnvelope;
            });
        });
    };

    const openChatFromRecord = (
        record: FeedRecordEnvelope,
        surface: ChatEntrySurface,
    ) => {
        setChatIntent({
            aidPostUri: record.aidPostUri,
            aidPostTitle: record.card.title,
            recipientDid: record.recipientDid,
            initiatedFrom: surface,
        });
        setChatState(defaultChatLaunchState);
        setChatRequestPreview(undefined);
        navigate('/chat');
    };

    const launchChat = async () => {
        if (!chatIntent) {
            return;
        }

        const request = buildChatInitiationRequest(chatIntent, currentUserDid);
        setChatRequestPreview(JSON.stringify(request, null, 2));

        setChatState(current =>
            reduceChatLaunchState(current, {
                type: 'submit',
                intent: chatIntent,
            }),
        );

        const apiResult = await initiateChatViaApi({
            aidPostUri: chatIntent.aidPostUri,
            initiatedByDid: currentUserDid,
            recipientDid: chatIntent.recipientDid,
            initiatedFrom: chatIntent.initiatedFrom,
            allowInitiation: hasChatPermission,
            supportsAtprotoChat: !forceChatFallback,
            now: nowIso(),
        });

        if (!apiResult.ok) {
            setChatState(current =>
                reduceChatLaunchState(current, {
                    type: 'failure',
                    intent: chatIntent,
                    errorMessage: apiResult.error,
                }),
            );
            return;
        }

        const fallbackNotice = apiResult.data.fallbackNotice;
        const fallbackTransport = fallbackNotice?.transportPath;

        setChatState(current =>
            reduceChatLaunchState(current, {
                type: 'success',
                intent: chatIntent,
                result: {
                    conversationUri: apiResult.data.conversationUri,
                    created: apiResult.data.created,
                    transportPath: apiResult.data.transportPath,
                    fallbackNotice:
                        (
                            fallbackTransport &&
                            fallbackTransport !== 'atproto-direct'
                        ) ?
                            {
                                code: 'RECIPIENT_CAPABILITY_MISSING',
                                message: fallbackNotice.message,
                                safeForUser: true,
                                transportPath: fallbackTransport,
                            }
                        :   undefined,
                },
            }),
        );
    };

    const resetChat = () => {
        setChatState(defaultChatLaunchState);
        setChatIntent(undefined);
        setChatRequestPreview(undefined);
    };

    const content =
        currentRoute === '/map' ?
            <MapRoute
                discoveryState={discoveryState}
                onPatchDiscovery={patchDiscoveryState}
                feedRecords={feedRecords}
                isLoading={isAidLoading}
                errorMessage={aidErrorMessage}
                dataOrigin={aidDataOrigin}
                selectedPostId={selectedMapPostId}
                onSelectPost={setSelectedMapPostId}
                onOpenChat={openChatFromRecord}
                onTriageAction={(postId, action) => {
                    const nextStatus: AidStatus =
                        action === 'mark_in_progress' ? 'in-progress'
                        : action === 'mark_resolved' ? 'resolved'
                        : 'open';

                    if (action !== 'contact_helper') {
                        applyLifecycleAction({
                            action: 'edit',
                            id: postId,
                            patch: {
                                status: nextStatus,
                                updatedAt: nowIso(),
                            },
                        });
                    }
                }}
            />
        : currentRoute === '/feed' ?
            <FeedRoute
                discoveryState={discoveryState}
                onPatchDiscovery={patchDiscoveryState}
                feedRecords={feedRecords}
                isLoading={isAidLoading}
                errorMessage={aidErrorMessage}
                dataOrigin={aidDataOrigin}
                onNavigate={navigate}
                onOpenChat={openChatFromRecord}
                onUpdateCard={(id, patch) => {
                    applyLifecycleAction({
                        action: 'edit',
                        id,
                        patch,
                    });
                }}
                onCloseCard={id => {
                    applyLifecycleAction({
                        action: 'close',
                        id,
                        closedAt: nowIso(),
                    });
                }}
                onTransition={(id, postUri, targetStatus) => {
                    void transitionAidPostViaApi({
                        postUri,
                        targetStatus,
                        actorDid: currentUserDid,
                        actorRole: 'coordinator',
                        now: nowIso(),
                    }).then(result => {
                        if (result.ok) {
                            applyLifecycleAction({
                                action: 'transition',
                                id,
                                targetStatus,
                                actorDid: currentUserDid,
                                actorRole: 'coordinator',
                            });
                        }
                    });
                }}
            />
        : currentRoute === '/posting' ?
            <PostingRoute
                authorDid={currentUserDid}
                center={discoveryState.center ?? defaultDiscoveryCenter}
                onCreateRecord={record => {
                    setFeedRecords(current => [record, ...current]);
                    patchDiscoveryState({
                        text: record.card.title,
                        feedTab: 'latest',
                    });
                }}
                onNavigate={navigate}
                onCreateViaApi={createAidPostViaApi}
            />
        : currentRoute === '/resources' ?
            <ResourceRoute
                discoveryState={discoveryState}
                onPatchDiscovery={patchDiscoveryState}
                onNavigate={navigate}
                isLoading={isDirectoryLoading}
                errorMessage={directoryErrorMessage}
                dataOrigin={directoryDataOrigin}
                resourceCards={resourceCards}
            />
        : currentRoute === '/volunteer' ? <VolunteerRoute />
        : currentRoute === '/chat' ?
            <ChatRoute
                currentUserDid={currentUserDid}
                hasPermission={hasChatPermission}
                onTogglePermission={setHasChatPermission}
                forceFallback={forceChatFallback}
                onToggleFallback={setForceChatFallback}
                intent={chatIntent}
                state={chatState}
                requestPreview={chatRequestPreview}
                onLaunch={launchChat}
                onReset={resetChat}
            />
        : currentRoute === '/settings' ?
            <SettingsRoute currentUserDid={currentUserDid} />
        :   <DashboardRoute
                appTitle={appTitle}
                onNavigate={navigate}
                discoveryState={discoveryState}
                onPatchDiscovery={patchDiscoveryState}
            />;

    return (
        <main className='mh-grain min-h-screen overflow-x-clip bg-mh-bg text-mh-text'>
            <a
                href='#main-content'
                className='mh-skip-link sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-mh-accent focus:px-4 focus:py-2 focus:text-white focus:outline-2 focus:outline-offset-2'
            >
                Skip to main content
            </a>
            <div className='mh-grid-pattern mx-auto min-h-screen max-w-6xl border-x border-mh-border px-3 pb-12 pt-6 sm:border-x-2 sm:px-6 lg:px-8'>
                <nav
                    aria-label='Primary flows'
                    className='mb-8 flex flex-wrap gap-2 border-b border-mh-border pb-4 sm:border-b-2 sm:pb-6'
                >
                    {appRoutes.map(route => (
                        <a
                            key={route}
                            href={route}
                            className='mh-nav-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mh-accent'
                            aria-current={
                                currentRoute === route ? 'page' : undefined
                            }
                            onClick={event => handleRouteClick(event, route)}
                        >
                            {routeLabels[route]}
                        </a>
                    ))}
                </nav>

                <div id='main-content' ref={mainContentRef} tabIndex={-1} className='outline-none'>
                    {content}
                </div>
            </div>
        </main>
    );
};
