import {
    lazy,
    Suspense,
    useCallback,
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
    buildDirectoryResourceRecord,
    directoryOperationalStatuses,
    directoryResourceCategories,
    draftFromDirectoryResource,
    type DirectoryResourceDraft,
} from '../directory-resource-form';
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
import { TextLink } from '../components/TextLink';
import {
    type AidPostReportReason,
    type ApiDataOrigin,
    type AtAidPostResult,
    type AtDirectoryResourceResult,
    type AtVolunteerProfileResult,
    type MyOrganization,
    type OrganizationMember,
    type OrganizationStewardship,
    type PublicOrganization,
    type ExactAddressRequest,
    type ActivityInboxItem,
    type CoordinationConnection,
    type CoordinationOffer,
    type MatchCandidate,
    type NotificationChannelState,
    type MaintenanceReasonCode,
    type MaintenanceState,
    type OutcomeFeedback,
    type PrivateAttachment,
    type VerificationApplication,
    type VerificationAppeal,
    type VerificationReviewQueue,
    type VerificationSubjectType,
    type VerificationWorkspace,
    type VolunteerDiscoveryProfile,
    type VolunteerProfileCommandInput,
    acceptCurrentPoliciesViaApi,
    acceptOrganizationInvitationViaApi,
    assignOrganizationStewardshipViaApi,
    blockUserViaApi,
    closeAtAidPostViaApi,
    createAidPostViaApi,
    createAtDirectoryResourceViaApi,
    createAtVolunteerProfileViaApi,
    createOrganizationViaApi,
    createCoordinationOfferViaApi,
    deactivateAccountViaApi,
    deleteAtDirectoryResourceViaApi,
    deleteAtVolunteerProfileViaApi,
    deleteAtAidPostViaApi,
    exportDataViaApi,
    fetchAccountOnboardingViaApi,
    fetchAccountPreferencesViaApi,
    fetchActivityInboxViaApi,
    fetchCoordinationViaApi,
    fetchDirectoryCardsFromApi,
    fetchFeedRecordsFromApi,
    fetchMyOrganizationsViaApi,
    fetchOrganizationMembersViaApi,
    fetchOrganizationsViaApi,
    fetchMyOutcomeFeedbackViaApi,
    fetchNotificationChannelsViaApi,
    fetchModeratorMaintenanceViaApi,
    fetchModerationAuditViaApi,
    fetchModerationQueueViaApi,
    fetchNotificationsViaApi,
    fetchPublicMaintenanceStatusViaApi,
    fetchOrganizationStewardshipsViaApi,
    fetchPrivateAttachmentsViaApi,
    fetchExactAddressReviewQueueViaApi,
    fetchVerificationReviewQueueViaApi,
    fetchVerificationWorkspaceViaApi,
    fetchSettingsAuditFromApi,
    fetchSettingsFromApi,
    fetchVolunteerProfilesViaApi,
    getAtDirectoryResourceViaApi,
    getAtVolunteerProfileViaApi,
    initiateChatViaApi,
    inviteOrganizationMemberViaApi,
    decideCoordinationOfferViaApi,
    decideExactAddressViaApi,
    decideVerificationAppealViaApi,
    decideVerificationViaApi,
    queryAidPostLifecycleViaApi,
    markActivityInboxReadViaApi,
    markAllNotificationsReadViaApi,
    markNotificationReadViaApi,
    matchRequestViaApi,
    reportAidPostViaApi,
    requestNotificationEmailVerificationViaApi,
    reconcileAidPostStatusViaApi,
    reconfirmOrganizationStewardshipViaApi,
    requestExactPublicAddressViaApi,
    requestPrivateAttachmentAccessViaApi,
    removeOrganizationMemberViaApi,
    updateSettingsViaApi,
    transitionAidPostViaApi,
    transitionCoordinationConnectionViaApi,
    submitOutcomeFeedbackViaApi,
    submitVerificationAppealViaApi,
    submitVerificationApplicationViaApi,
    confirmNotificationEmailViaApi,
    disableNotificationEmailViaApi,
    archiveNotificationViaApi,
    registerPushSubscriptionViaApi,
    revokePushSubscriptionViaApi,
    uploadPrivateAttachmentViaApi,
    deletePrivateAttachmentViaApi,
    reviewPrivateAttachmentViaApi,
    updateAccountPreferencesViaApi,
    updateOrganizationMemberRoleViaApi,
    updateAtDirectoryResourceViaApi,
    updateAtVolunteerProfileViaApi,
    applyModerationPolicyViaApi,
    declareMaintenanceViaApi,
    resumeMaintenanceViaApi,
} from './api-client';
import { ExactLocationExchange } from './exact-location-exchange';
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
    CURRENT_POLICY_VERSION,
    CHAT_PLACEHOLDER_CONTRACT,
    defaultAccountPreferences,
    type Notification as DurableNotification,
    type NotificationFilter,
    type ModerationAuditRecord,
    type ModerationPolicyAction,
    type ModerationQueueItem,
    requiredPolicyDocuments,
    type AccountPreferences,
    type UserSettings,
    geoSharingPrecisions,
    privacyLevels,
} from '@patchwork/shared';
import {
    defaultDiscoveryCenter,
    type FeedRecordEnvelope,
} from './discovery-runtime';
import { useAuth } from '../auth/AuthProvider';
import { resolveWebDataMode } from './data-mode';

const webDataMode = resolveWebDataMode(import.meta.env, {
    command: import.meta.env.PROD ? 'build' : 'serve',
    mode: import.meta.env.MODE,
});

const dataOriginLabel = (origin: ApiDataOrigin): string =>
    origin === 'api' ? 'DB-backed API'
    : origin === 'fixture' ? 'Local fixture demo'
    : 'API unavailable';

const appRoutes = [
    '/',
    '/map',
    '/feed',
    '/resources',
    '/volunteer',
    '/organizations',
    '/verification',
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

const deferredFixtureRoutes = new Set<AppRoute>([
    '/chat',
    '/scheduling',
    '/feedback',
    '/groups',
]);

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
    '/organizations': 'Organizations',
    '/verification': 'Verification',
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

const primaryRoutes: readonly AppRoute[] = [
    '/',
    '/map',
    '/feed',
    '/resources',
    '/volunteer',
    '/organizations',
    '/verification',
    '/posting',
];

const accountRoutes: readonly AppRoute[] = ['/volunteer', '/chat', '/settings'];
const productionAccountRoutes: readonly AppRoute[] = [
    '/inbox',
    '/notifications',
    '/moderation',
    '/settings',
];

const secondaryRoutes = appRoutes.filter(
    route =>
        !primaryRoutes.includes(route) &&
        !accountRoutes.includes(route) &&
        !route.startsWith('/legal/'),
);

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
    return {
        id: record.card.id,
        title: record.card.title,
        summary: record.card.description,
        category: record.card.category,
        status: record.card.status,
        urgency: record.card.urgency,
        updatedAt: record.card.updatedAt,
        location: record.card.location,
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

const formatDateTime = (value: string): string => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ?
            'an unavailable date'
        :   parsed.toLocaleString();
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
                name={`${idPrefix}-search`}
                autoComplete='off'
                placeholder='Search by title, description, or area…'
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
                            name={`${idPrefix}-radius`}
                            autoComplete='off'
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
                            name={`${idPrefix}-lat`}
                            autoComplete='off'
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
                            name={`${idPrefix}-lng`}
                            autoComplete='off'
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

const LegalPolicyRoute = ({
    route,
}: {
    route:
        | '/legal/terms'
        | '/legal/privacy'
        | '/legal/community-guidelines';
}) => {
    const content =
        route === '/legal/terms' ?
            {
                title: 'Terms of Service',
                summary:
                    'Patchwork is peer-to-peer mutual-aid coordination, not an emergency, professional, fulfillment, or identity-guarantee service.',
                points: [
                    'You must be at least 18 and accept the current policy version before protected actions.',
                    'Public aid, volunteer, and directory records can federate through AT Protocol; private offers, connections, evidence, and attachments do not.',
                    'Production chat is not available. Activity inbox items are workflow events, not messages.',
                    'Synthetic records are fictional. Public-source organization references do not imply participation or endorsement.',
                ],
            }
        : route === '/legal/privacy' ?
            {
                title: 'Privacy Policy',
                summary:
                    'Patchwork separates public AT records from private operational state and minimizes location, attachment, notification, and moderation data.',
                points: [
                    'Personal and volunteer locations are public only at 1 km precision or coarser.',
                    'Exact personal coordinates move only over a freshly consented encrypted peer channel and are not persisted by Patchwork.',
                    'A verified, non-confidential resource address is public only after separate moderator approval.',
                    'Private attachments are scanned and transformed; clean access is authenticated and short-lived.',
                    'Exports omit credentials, file bodies, signed URLs, third-party casework, and exact personal coordinates.',
                ],
            }
        :   {
                title: 'Community Guidelines',
                summary:
                    'Use Patchwork in good faith, protect privacy, and report fraud, harassment, discrimination, illegal activity, or attempts to bypass safety controls.',
                points: [
                    'Never publish another person’s private contact or exact-location information.',
                    'Moderators can delist, suspend visibility, restore content, and review appeals with an audit trail.',
                    'The report-review aim is two business days on a best-effort basis; it is not an emergency response or guaranteed service level.',
                    'Use emergency and professional services outside Patchwork when the situation requires them.',
                ],
            };
    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <p className='mh-kicker'>Unapproved draft — not in force</p>
                <h1 className='mh-route-title'>{content.title}</h1>
                <p className='mt-2 max-w-3xl text-mh-textMuted'>
                    {content.summary}
                </p>
            </header>
            <Panel title='Buyer-ready policy summary'>
                <ul className='list-disc space-y-2 pl-5'>
                    {content.points.map(point => (
                        <li key={point}>{point}</li>
                    ))}
                </ul>
                <p className='mt-4 text-sm font-bold'>
                    Patchwork remains operationally NO-GO. These drafts require
                    legal and product-owner approval before publication as
                    effective terms.
                </p>
            </Panel>
            <nav aria-label='Policy drafts' className='flex flex-wrap gap-4'>
                <a className='mh-link' href='/legal/terms'>Terms</a>
                <a className='mh-link' href='/legal/privacy'>Privacy</a>
                <a className='mh-link' href='/legal/community-guidelines'>
                    Community guidelines
                </a>
            </nav>
        </section>
    );
};

const DashboardRoute = ({
    appTitle,
    onNavigate,
    discoveryState,
    onPatchDiscovery,
}: DashboardRouteProps) => {
    return (
        <>
            <header className='mh-hero mb-8 pb-6 sm:pb-8'>
                <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
                    <p className='mh-kicker'>Your neighborhood response desk</p>
                    <Badge tone='danger'>Safety guardrails active</Badge>
                </div>

                <div className='grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'>
                    <div>
                        <h1 className='font-heading text-5xl font-black leading-[0.88] tracking-[-0.055em] sm:text-6xl md:text-7xl lg:text-8xl'>
                            {appTitle}
                        </h1>
                        <p className='mt-4 max-w-xl text-base text-mh-textMuted sm:text-lg'>
                            Find help. Offer what you can. Keep urgent work
                            moving without exposing more than neighbors need to
                            know.
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
                            {webDataMode === 'fixture' ?
                                <Button
                                    variant='neutral'
                                    onClick={() => onNavigate('/chat')}
                                >
                                    Open chat handoff
                                </Button>
                            :   null}
                        </div>
                    </div>

                    <aside className='mh-card p-4 sm:p-5'>
                        <p className='mh-kicker'>Current service posture</p>
                        <ul className='mt-3 grid gap-2'>
                            <li className='mh-stat-tile'>
                                <p className='text-xs uppercase tracking-widest text-mh-textSoft'>
                                    Discovery source
                                </p>
                                <p className='mt-1 text-sm font-black text-mh-text'>
                                    Durable projections
                                </p>
                            </li>
                            <li className='mh-stat-tile'>
                                <p className='text-xs uppercase tracking-widest text-mh-textSoft'>
                                    Safety controls
                                </p>
                                <p className='mt-1 text-sm font-black text-mh-text'>
                                    Reports and blocks
                                </p>
                            </li>
                            <li className='mh-stat-tile'>
                                <p className='text-xs uppercase tracking-widest text-mh-textSoft'>
                                    Account controls
                                </p>
                                <p className='mt-1 text-sm font-black text-mh-text'>
                                    Export and deactivation
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
                            name='searchRequests'
                            autoComplete='off'
                            placeholder='e.g., food, shelter, transport…'
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

                <section className='lg:col-span-2'>
                    <Card title='Pre-alpha operating boundary'>
                        <ul className='list-disc space-y-1 pl-5 text-sm'>
                            <li>Patchwork is not an emergency service.</li>
                            <li>Discovery uses approximate public locations.</li>
                            <li>
                                Sign in before posting or using private safety
                                and account controls.
                            </li>
                        </ul>
                        <p className='mt-3'>
                            Read the{' '}
                            <TextLink href='/legal/community-guidelines'>
                                community guidelines
                            </TextLink>{' '}
                            before participating.
                        </p>
                    </Card>
                </section>

                <section className='lg:col-span-5'>
                    <Card title='Quick route handoffs'>
                        <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                            {shellSections
                                .filter(
                                    section =>
                                        primaryRoutes.includes(
                                            section.route as AppRoute,
                                        ) ||
                                        (
                                            webDataMode === 'fixture' ?
                                                accountRoutes
                                            :   productionAccountRoutes
                                        ).includes(
                                            section.route as AppRoute,
                                        ),
                                )
                                .map(section => (
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
    onRetry: () => void;
    selectedPostId?: string;
    onSelectPost: (id: string | undefined) => void;
    onTriageAction: (postId: string, action: MapTriageAction) => void;
    onOpenChat: (record: FeedRecordEnvelope, surface: ChatEntrySurface) => void;
}

const LazyInteractiveMap = lazy(() =>
    import('../components/map/InteractiveMap.js').then(module => ({
        default: module.InteractiveMap,
    })),
);

const MapRoute = ({
    discoveryState,
    onPatchDiscovery,
    feedRecords,
    isLoading,
    errorMessage,
    dataOrigin,
    onRetry,
    selectedPostId,
    onSelectPost,
    onTriageAction,
    onOpenChat,
}: MapRouteProps) => {
    const [tileError, setTileError] = useState<string>();
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
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>
                    Map triage
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Approximate-area clustering with privacy-safe radii and
                    direct handoff actions.
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                    <Badge tone={dataOrigin === 'api' ? 'success' : 'info'}>
                        {dataOriginLabel(dataOrigin)}
                    </Badge>
                </div>
                {errorMessage ?
                    <div
                        role='alert'
                        className='mh-alert mt-3 text-xs font-bold'
                    >
                        <p>API sync issue: {errorMessage}</p>
                        {feedRecords.length > 0 ?
                            <p>
                                Showing previously loaded results; they may be
                                stale.
                            </p>
                        :   null}
                        <Button
                            type='button'
                            variant='neutral'
                            className='mt-2 px-3 py-1 text-xs'
                            onClick={onRetry}
                        >
                            Retry discovery
                        </Button>
                    </div>
                :   null}
            </header>

            <DiscoveryFiltersPanel
                idPrefix='map'
                state={discoveryState}
                onPatch={onPatchDiscovery}
            />

            <section className='rounded-none border-2 border-mh-borderSoft bg-mh-surfaceElev p-3'>
                {tileError ? (
                    <div role='alert' className='mh-alert mb-3 text-xs font-bold'>
                        <p>{tileError}</p>
                    </div>
                ) : null}
                <Suspense fallback={<div className='mh-skeleton h-96 w-full' />}>
                    <LazyInteractiveMap
                        cards={mapView.filteredCards}
                        selectedPostId={selectedPostId}
                        center={discoveryState.center ?? defaultDiscoveryCenter}
                        onSelectPostId={onSelectPost}
                        onTilesFailed={setTileError}
                    />
                </Suspense>
            </section>

            <div className='grid gap-6 xl:grid-cols-2'>
                <Card title='Cluster overview'>
                    {isLoading ?
                        <ul className='space-y-3' aria-live='polite'>
                            {Array.from({ length: 3 }).map((_, index) => (
                                <li
                                    key={`cluster-skeleton-${index}`}
                                    className='mh-record-card'
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
                                    className='mh-record-card'
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
                                    className='mh-record-card'
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
                                    className='mh-record-card'
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
                <Panel
                    title='Map detail drawer'
                    aria-label={`Details for ${drawer.title ?? 'selected request'}`}
                >
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
                        {drawer.actions
                            .filter(
                                action =>
                                    webDataMode === 'fixture' ||
                                    action.action !== 'contact_helper',
                            )
                            .map(action => (
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
                                        if (
                                            action.action === 'contact_helper'
                                        ) {
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

const lifecycleStatusFromValue = (
    value: string,
): LifecycleStatus | undefined => {
    const normalized = value === 'in-progress' ? 'in_progress' : value;
    return (
            [
                'open',
                'triaged',
                'assigned',
                'in_progress',
                'resolved',
                'archived',
            ].includes(normalized)
        ) ?
            (normalized as LifecycleStatus)
        :   undefined;
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
    onRetry: () => void;
    publicSyncFailure?: PublicSyncFailure;
    publicSyncRetrying: boolean;
    onRetryPublicSync: () => void;
    onNavigate: (route: AppRoute) => void;
    onOpenChat: (record: FeedRecordEnvelope, surface: ChatEntrySurface) => void;
    onUpdateCard: (id: string, patch: Partial<Omit<FeedAidCard, 'id'>>) => void;
    onReplaceRecord: (record: FeedRecordEnvelope) => void;
    onDeleteRecord: (aidPostUri: string) => void;
    onTransition?: (
        id: string,
        postUri: string,
        targetStatus: LifecycleStatus,
    ) => void;
    currentUserDid?: string;
}

interface PublicSyncFailure {
    postUri: string;
    expectedCid: string;
    updatedAt: string;
    message: string;
}

const replaceRecordFromAtResult = (
    records: readonly FeedRecordEnvelope[],
    result: AtAidPostResult,
): FeedRecordEnvelope[] =>
    records.map(record =>
        record.aidPostUri === result.uri ?
            {
                ...record,
                cid: result.cid,
                card: {
                    ...record.card,
                    status: result.record.status,
                    updatedAt:
                        result.record.updatedAt ?? result.record.createdAt,
                },
            }
        :   record,
    );

const SafetyActions = ({ record }: { record: FeedRecordEnvelope }) => {
    const [mode, setMode] = useState<'report' | 'block'>();
    const [reason, setReason] = useState<AidPostReportReason>('other');
    const [details, setDetails] = useState('');
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<string>();
    const [error, setError] = useState<string>();

    const submitReport = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPending(true);
        setNotice(undefined);
        setError(undefined);
        const result = await reportAidPostViaApi({
            subjectUri: record.aidPostUri,
            reason,
            ...(details.trim() ? { details: details.trim() } : {}),
        });
        setPending(false);
        if (!result.ok) {
            setError(`${result.code}: ${result.error}`);
            return;
        }
        setNotice(
            result.data.created ?
                'Report submitted.'
            :   'Report already submitted.',
        );
        setMode(undefined);
        setDetails('');
    };

    const confirmBlock = async () => {
        setPending(true);
        setNotice(undefined);
        setError(undefined);
        const result = await blockUserViaApi({
            subjectDid: record.recipientDid,
            reason: 'Blocked from a discovered aid request.',
        });
        setPending(false);
        if (!result.ok) {
            setError(`${result.code}: ${result.error}`);
            return;
        }
        setNotice(
            result.data.created ? 'Author blocked.' : 'Author already blocked.',
        );
        setMode(undefined);
    };

    return (
        <div className='mt-3 border-t-2 border-mh-borderSoft pt-3'>
            <div className='flex flex-wrap gap-2'>
                <Button
                    type='button'
                    variant='neutral'
                    className='px-3 py-1 text-xs'
                    aria-label={`Report ${record.card.title}`}
                    onClick={() => setMode('report')}
                >
                    Report request
                </Button>
                <Button
                    type='button'
                    variant='neutral'
                    className='px-3 py-1 text-xs'
                    aria-label={`Block author of ${record.card.title}`}
                    onClick={() => setMode('block')}
                >
                    Block author
                </Button>
            </div>

            {mode === 'report' ?
                <form className='mt-3 space-y-3' onSubmit={submitReport}>
                    <label className='block text-xs font-bold'>
                        Report reason
                        <select
                            name='reportReason'
                            autoComplete='off'
                            className='mt-1 block w-full border-2 border-mh-border bg-mh-surface p-2'
                            value={reason}
                            onChange={event =>
                                setReason(
                                    event.target.value as AidPostReportReason,
                                )
                            }
                        >
                            <option value='spam'>Spam</option>
                            <option value='abuse'>Abuse</option>
                            <option value='fraud'>Fraud</option>
                            <option value='other'>Other</option>
                        </select>
                    </label>
                    <label className='block text-xs font-bold'>
                        Private report details
                        <textarea
                            name='reportDetails'
                            autoComplete='off'
                            className='mt-1 block min-h-24 w-full border-2 border-mh-border bg-mh-surface p-2'
                            maxLength={1000}
                            value={details}
                            onChange={event => setDetails(event.target.value)}
                        />
                    </label>
                    <div className='flex flex-wrap gap-2'>
                        <Button type='submit' disabled={pending}>
                            {pending ? 'Submitting...' : 'Submit report'}
                        </Button>
                        <Button
                            type='button'
                            variant='neutral'
                            onClick={() => setMode(undefined)}
                            disabled={pending}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            : mode === 'block' ?
                <div
                    role='alertdialog'
                    aria-label='Confirm block author'
                    className='mh-alert mt-3'
                >
                    <p className='text-sm font-bold'>
                        Block this request author?
                    </p>
                    <p className='mt-1 text-xs'>
                        This private safety action is stored by Patchwork and is
                        not published to AT Protocol.
                    </p>
                    <div className='mt-2 flex flex-wrap gap-2'>
                        <Button
                            type='button'
                            onClick={() => void confirmBlock()}
                            disabled={pending}
                        >
                            {pending ? 'Blocking...' : 'Confirm block author'}
                        </Button>
                        <Button
                            type='button'
                            variant='neutral'
                            onClick={() => setMode(undefined)}
                            disabled={pending}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            :   null}

            {notice ?
                <p
                    role='status'
                    className='mt-2 text-xs font-bold text-mh-success'
                >
                    {notice}
                </p>
            :   null}
            {error ?
                <p role='alert' className='mh-alert mt-2 text-xs font-bold'>
                    {error}
                </p>
            :   null}
        </div>
    );
};

const OwnerRecordActions = ({
    record,
    onReplaceRecord,
    onDeleteRecord,
}: {
    record: FeedRecordEnvelope;
    onReplaceRecord: (record: FeedRecordEnvelope) => void;
    onDeleteRecord: (aidPostUri: string) => void;
}) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [pending, setPending] = useState<'close' | 'delete'>();
    const [notice, setNotice] = useState<string>();
    const [error, setError] = useState<string>();

    const closeRecord = async () => {
        if (!record.cid) return;
        setPending('close');
        setError(undefined);
        const result = await closeAtAidPostViaApi({
            uri: record.aidPostUri,
            expectedCid: record.cid,
            updatedAt: nowIso(),
        });
        setPending(undefined);
        if (!result.ok) {
            setError(`${result.code}: ${result.error}`);
            return;
        }
        onReplaceRecord({
            ...record,
            cid: result.data.cid,
            card: {
                ...record.card,
                status: 'closed',
                updatedAt:
                    result.data.record.updatedAt ??
                    result.data.record.createdAt,
            },
        });
        setNotice('Request closed.');
    };

    const deleteRecord = async () => {
        if (!record.cid) return;
        setPending('delete');
        setError(undefined);
        const result = await deleteAtAidPostViaApi({
            uri: record.aidPostUri,
            expectedCid: record.cid,
        });
        setPending(undefined);
        if (!result.ok) {
            setError(`${result.code}: ${result.error}`);
            return;
        }
        onDeleteRecord(record.aidPostUri);
    };

    return (
        <div className='mt-3 border-t-2 border-mh-borderSoft pt-3'>
            <div className='flex flex-wrap gap-2'>
                <Button
                    type='button'
                    variant='neutral'
                    aria-label={`Close ${record.card.title.toLowerCase()}`}
                    disabled={
                        !record.cid ||
                        record.card.status === 'closed' ||
                        pending !== undefined
                    }
                    onClick={() => void closeRecord()}
                >
                    {pending === 'close' ? 'Closing...' : 'Close request'}
                </Button>
                <Button
                    type='button'
                    variant='neutral'
                    aria-label={`Delete ${record.card.title.toLowerCase()}`}
                    disabled={!record.cid || pending !== undefined}
                    onClick={() => setConfirmDelete(true)}
                >
                    Delete request
                </Button>
            </div>
            {!record.cid ?
                <p className='mt-2 text-xs text-mh-textMuted'>
                    Waiting for the indexed record revision before owner
                    mutations are available.
                </p>
            :   null}
            {confirmDelete ?
                <div
                    role='alertdialog'
                    aria-label='Confirm delete request'
                    className='mh-alert mt-3'
                >
                    <p className='text-sm font-bold'>
                        Permanently delete this AT record?
                    </p>
                    <p className='mt-1 text-xs'>
                        Deletion also removes its durable private workflow after
                        the PDS confirms it.
                    </p>
                    <div className='mt-2 flex flex-wrap gap-2'>
                        <Button
                            type='button'
                            onClick={() => void deleteRecord()}
                            disabled={pending !== undefined}
                        >
                            {pending === 'delete' ?
                                'Deleting...'
                            :   'Confirm delete request'}
                        </Button>
                        <Button
                            type='button'
                            variant='neutral'
                            onClick={() => setConfirmDelete(false)}
                            disabled={pending !== undefined}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            :   null}
            {notice ?
                <p
                    role='status'
                    className='mt-2 text-xs font-bold text-mh-success'
                >
                    {notice}
                </p>
            :   null}
            {error ?
                <p role='alert' className='mh-alert mt-2 text-xs font-bold'>
                    {error}
                </p>
            :   null}
        </div>
    );
};

const FeedRoute = ({
    discoveryState,
    onPatchDiscovery,
    feedRecords,
    isLoading,
    errorMessage,
    dataOrigin,
    onRetry,
    publicSyncFailure,
    publicSyncRetrying,
    onRetryPublicSync,
    onNavigate,
    onOpenChat,
    onUpdateCard,
    onReplaceRecord,
    onDeleteRecord,
    onTransition,
    currentUserDid,
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
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>
                    Feed operations
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Manage lifecycle transitions and launch handoffs directly
                    from feed cards.
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                    <Badge tone={dataOrigin === 'api' ? 'success' : 'info'}>
                        {dataOriginLabel(dataOrigin)}
                    </Badge>
                </div>
                {errorMessage ?
                    <div
                        role='alert'
                        className='mh-alert mt-3 text-xs font-bold'
                    >
                        <p>API sync issue: {errorMessage}</p>
                        {feedRecords.length > 0 ?
                            <p>
                                Showing previously loaded results; they may be
                                stale.
                            </p>
                        :   null}
                        <Button
                            type='button'
                            variant='neutral'
                            className='mt-2 px-3 py-1 text-xs'
                            onClick={onRetry}
                        >
                            Retry discovery
                        </Button>
                    </div>
                :   null}
                {publicSyncFailure ?
                    <div
                        role='alert'
                        className='mh-alert mt-3 text-xs font-bold'
                    >
                        <p>
                            Private workflow saved, but its public AT status is
                            not synchronized: {publicSyncFailure.message}
                        </p>
                        <Button
                            type='button'
                            variant='neutral'
                            className='mt-2 px-3 py-1 text-xs'
                            disabled={publicSyncRetrying}
                            onClick={onRetryPublicSync}
                        >
                            {publicSyncRetrying ?
                                'Retrying public sync...'
                            :   'Retry public status sync'}
                        </Button>
                    </div>
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
                                className='mh-record-card p-4'
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
                                    className='mh-record-card p-4'
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
                                                    {(
                                                        presentation.lifecycleBadge
                                                    ) ?
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
                                                    {record?.recordOrigin ===
                                                    'synthetic' ?
                                                        <Badge tone='info'>
                                                            Synthetic showcase
                                                        </Badge>
                                                    : record?.recordOrigin ===
                                                      'sourced-public' ?
                                                        <Badge tone='info'>
                                                            Public-source reference
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
                                    {(
                                        presentation &&
                                        presentation.transitionActions.length >
                                            0 &&
                                        onTransition &&
                                        record &&
                                        currentUserDid === record.recipientDid
                                    ) ?
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
                                        {record && webDataMode === 'fixture' ?
                                            <Button
                                                className='px-3 py-1 text-xs'
                                                onClick={() =>
                                                    onOpenChat(record, 'feed')
                                                }
                                            >
                                                Contact helper
                                            </Button>
                                        :   null}

                                        {dataOrigin === 'fixture' ?
                                            <Button
                                                variant='secondary'
                                                className='px-3 py-1 text-xs'
                                                onClick={() =>
                                                    onUpdateCard(card.id, {
                                                        urgency: Math.min(
                                                            5,
                                                            card.urgency + 1,
                                                        ) as 1 | 2 | 3 | 4 | 5,
                                                        updatedAt: nowIso(),
                                                    })
                                                }
                                                disabled={card.urgency >= 5}
                                            >
                                                Escalate urgency
                                            </Button>
                                        :   null}

                                        {/* Timeline toggle */}
                                        {(
                                            card.timeline &&
                                            card.timeline.length > 0
                                        ) ?
                                            <Button
                                                variant='neutral'
                                                className='px-3 py-1 text-xs'
                                                onClick={() =>
                                                    setExpandedTimelineId(
                                                        current =>
                                                            (
                                                                current ===
                                                                card.id
                                                            ) ?
                                                                undefined
                                                            :   card.id,
                                                    )
                                                }
                                            >
                                                {(
                                                    expandedTimelineId ===
                                                    card.id
                                                ) ?
                                                    'Hide timeline'
                                                :   `Timeline (${card.timeline.length})`
                                                }
                                            </Button>
                                        :   null}
                                    </div>

                                    {(
                                        record &&
                                        currentUserDid &&
                                        currentUserDid !== record.recipientDid
                                    ) ?
                                        <SafetyActions record={record} />
                                    :   null}
                                    {(
                                        record &&
                                        currentUserDid === record.recipientDid
                                    ) ?
                                        <OwnerRecordActions
                                            record={record}
                                            onReplaceRecord={onReplaceRecord}
                                            onDeleteRecord={onDeleteRecord}
                                        />
                                    :   null}

                                    {/* Expanded timeline panel */}
                                    {(
                                        expandedTimelineId === card.id &&
                                        card.timeline
                                    ) ?
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
    center: { lat: number; lng: number };
    onCreateRecord: (record: FeedRecordEnvelope) => void;
    onNavigate: (route: AppRoute) => void;
    onCreateViaApi: (input: {
        draft: NormalizedAidPostingDraft;
        rkey: string;
        now: string;
    }) => Promise<
        { ok: true; data: FeedRecordEnvelope } | { ok: false; error: string }
    >;
}

const PostingRoute = ({
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
    const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
    const [attachmentStatus, setAttachmentStatus] = useState<string>();

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
            attachments: attachmentFiles.map(file => ({
                filename: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
                previewUrl: '',
            })),
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

            let uploaded = 0;
            for (const file of attachmentFiles) {
                setAttachmentStatus(
                    `Uploading private attachment ${uploaded + 1} of ${attachmentFiles.length}…`,
                );
                const attachment = await uploadPrivateAttachmentViaApi(
                    file,
                    'aid-post',
                    createResult.data.aidPostUri,
                );
                if (!attachment.ok) {
                    setSuccessMessage(
                        `Created post ${localId}. ${uploaded} attachment(s) were accepted.`,
                    );
                    setApiError(
                        `The request is public, but a private attachment upload failed: ${attachment.error}`,
                    );
                    setAttachmentStatus(
                        'Attachment upload stopped. Selected files remain available to retry on a new request.',
                    );
                    return;
                }
                uploaded += 1;
            }
            setAttachmentFiles([]);
            setAttachmentStatus(
                uploaded > 0 ?
                    `${uploaded} private attachment(s) uploaded and queued for malware scanning.`
                :   undefined,
            );
            setSuccessMessage(
                `Created post ${localId} and persisted via API/DB.`,
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>
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
                            name='title'
                            autoComplete='off'
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
                            name='description'
                            autoComplete='off'
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
                                name='category'
                                autoComplete='off'
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
                                name='urgency'
                                autoComplete='off'
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
                            name='accessibilityTags'
                            autoComplete='off'
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
                                name='latitude'
                                autoComplete='off'
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
                                name='longitude'
                                autoComplete='off'
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
                                name='precisionMeters'
                                autoComplete='off'
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
                                name='startAt'
                                autoComplete='off'
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
                                name='endAt'
                                autoComplete='off'
                                type='datetime-local'
                                value={endAt}
                                onChange={event => setEndAt(event.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor='posting-attachments'
                            className='mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-mh-text'
                        >
                            Private attachments (optional)
                        </label>
                        <Input
                            id='posting-attachments'
                            type='file'
                            multiple
                            accept='image/jpeg,image/png,image/gif,image/webp,application/pdf'
                            onChange={event =>
                                setAttachmentFiles(
                                    Array.from(event.target.files ?? []),
                                )
                            }
                        />
                        <p className='mt-1 text-xs text-mh-textSoft'>
                            Up to five images or PDFs, 10 MB each. Files remain
                            private, are scanned and transformed, and are
                            available only to authenticated people.
                        </p>
                        {attachmentFiles.length ?
                            <ul className='mt-2 text-xs'>
                                {attachmentFiles.map(file => (
                                    <li key={`${file.name}-${file.size}`}>
                                        {file.name} ·{' '}
                                        {Math.ceil(file.size / 1024)} KB
                                    </li>
                                ))}
                            </ul>
                        :   null}
                        {attachmentStatus ?
                            <p className='mt-2 text-xs font-bold' role='status'>
                                {attachmentStatus}
                            </p>
                        :   null}
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

const defaultDirectoryDraft = (center: {
    lat: number;
    lng: number;
}): DirectoryResourceDraft => ({
    name: '',
    category: 'food-bank',
    serviceArea: '',
    contactUrl: '',
    contactPhone: '',
    latitude: center.lat.toFixed(4),
    longitude: center.lng.toFixed(4),
    precisionKm: '1',
    openHours: '',
    eligibilityNotes: '',
    operationalStatus: 'open',
});

interface DirectoryResourceManagerProps {
    currentUserDid: string;
    center: { lat: number; lng: number };
    onChanged: () => void;
    editUri?: string;
    onEditHandled: () => void;
}

const DirectoryResourceManager = ({
    currentUserDid,
    center,
    onChanged,
    editUri,
    onEditHandled,
}: DirectoryResourceManagerProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState<DirectoryResourceDraft>(() =>
        defaultDirectoryDraft(center),
    );
    const [editing, setEditing] = useState<AtDirectoryResourceResult>();
    const [issues, setIssues] = useState<string[]>([]);
    const [notice, setNotice] = useState<string>();
    const [error, setError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const reset = () => {
        setDraft(defaultDirectoryDraft(center));
        setEditing(undefined);
        setIssues([]);
        setError(undefined);
        setConfirmDelete(false);
    };

    const beginCreate = () => {
        reset();
        setNotice(undefined);
        setIsOpen(true);
    };

    useEffect(() => {
        if (!editUri) return undefined;
        let active = true;
        setError(undefined);
        setNotice(undefined);
        void getAtDirectoryResourceViaApi(editUri)
            .then(result => {
                if (!active) return;
                if (!result.ok) {
                    setError(`${result.code}: ${result.error}`);
                    setIsOpen(true);
                    return;
                }
                setEditing(result.data);
                setDraft(draftFromDirectoryResource(result.data.record));
                setIssues([]);
                setConfirmDelete(false);
                setIsOpen(true);
            })
            .finally(() => {
                if (active) onEditHandled();
            });
        return () => {
            active = false;
        };
    }, [editUri]);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(undefined);
        setNotice(undefined);
        const built = buildDirectoryResourceRecord(
            draft,
            nowIso(),
            editing?.record,
        );
        setIssues(built.issues);
        if (!built.ok || !built.record) return;

        setIsSubmitting(true);
        try {
            const result =
                editing ?
                    await updateAtDirectoryResourceViaApi({
                        uri: editing.uri,
                        expectedCid: editing.cid,
                        record: built.record,
                    })
                :   await createAtDirectoryResourceViaApi(built.record);
            if (!result.ok) {
                setError(`${result.code}: ${result.error}`);
                return;
            }
            setEditing(result.data);
            setDraft(draftFromDirectoryResource(result.data.record));
            setNotice(
                editing ?
                    'Resource updated. Directory ingestion may take a moment.'
                :   'Resource published. It will appear after directory ingestion.',
            );
            onChanged();
        } finally {
            setIsSubmitting(false);
        }
    };

    const remove = async () => {
        if (!editing) return;
        setIsSubmitting(true);
        setError(undefined);
        try {
            const result = await deleteAtDirectoryResourceViaApi({
                uri: editing.uri,
                expectedCid: editing.cid,
            });
            if (!result.ok) {
                setError(`${result.code}: ${result.error}`);
                return;
            }
            reset();
            setIsOpen(false);
            setNotice('Resource deleted from your AT repository.');
            onChanged();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card title='Publish and manage'>
            {currentUserDid ?
                <>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                        <div>
                            <p className='text-sm font-bold text-mh-text'>
                                Community directory steward
                            </p>
                            <p className='mt-1 max-w-2xl text-xs text-mh-textMuted'>
                                Publish public service details from your AT
                                identity. New listings begin unverified; trusted
                                verification is a separate review.
                            </p>
                        </div>
                        <Button
                            type='button'
                            variant='secondary'
                            className='px-3 py-2 text-xs'
                            onClick={beginCreate}
                        >
                            Add a resource
                        </Button>
                    </div>
                    {notice ?
                        <p
                            role='status'
                            className='mh-alert mt-4 text-xs font-bold'
                        >
                            {notice}
                        </p>
                    :   null}
                    {error ?
                        <p
                            role='alert'
                            className='mh-alert mt-4 text-xs font-bold'
                        >
                            {error}
                        </p>
                    :   null}
                    {isOpen ?
                        <form
                            className='mt-5 space-y-4 border-t-2 border-mh-borderSoft pt-5'
                            onSubmit={submit}
                        >
                            <div className='flex flex-wrap items-center justify-between gap-2'>
                                <h2 className='text-lg font-bold text-mh-text'>
                                    {editing ?
                                        'Edit directory resource'
                                    :   'New directory resource'}
                                </h2>
                                <Badge tone='info'>
                                    {editing?.record.verificationStatus ??
                                        'unverified'}
                                </Badge>
                            </div>
                            <div className='grid gap-4 md:grid-cols-2'>
                                <div>
                                    <label
                                        htmlFor='directory-name'
                                        className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                    >
                                        Resource name
                                    </label>
                                    <Input
                                        id='directory-name'
                                        value={draft.name}
                                        onChange={event =>
                                            setDraft(current => ({
                                                ...current,
                                                name: event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor='directory-category'
                                        className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                    >
                                        Category
                                    </label>
                                    <select
                                        id='directory-category'
                                        className='mh-input w-full px-3 py-2 text-base'
                                        value={draft.category}
                                        onChange={event =>
                                            setDraft(current => ({
                                                ...current,
                                                category: event.target
                                                    .value as DirectoryResourceDraft['category'],
                                            }))
                                        }
                                    >
                                        {directoryResourceCategories.map(
                                            category => (
                                                <option
                                                    key={category}
                                                    value={category}
                                                >
                                                    {formatCategoryLabel(
                                                        category,
                                                    )}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label
                                    htmlFor='directory-service-area'
                                    className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                >
                                    Public service area
                                </label>
                                <Input
                                    id='directory-service-area'
                                    value={draft.serviceArea}
                                    onChange={event =>
                                        setDraft(current => ({
                                            ...current,
                                            serviceArea: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className='grid gap-4 md:grid-cols-2'>
                                <div>
                                    <label
                                        htmlFor='directory-url'
                                        className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                    >
                                        Public website
                                    </label>
                                    <Input
                                        id='directory-url'
                                        type='url'
                                        value={draft.contactUrl}
                                        onChange={event =>
                                            setDraft(current => ({
                                                ...current,
                                                contactUrl: event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor='directory-phone'
                                        className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                    >
                                        Public phone
                                    </label>
                                    <Input
                                        id='directory-phone'
                                        type='tel'
                                        value={draft.contactPhone}
                                        onChange={event =>
                                            setDraft(current => ({
                                                ...current,
                                                contactPhone:
                                                    event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                            </div>
                            <div className='grid gap-4 sm:grid-cols-3'>
                                <div>
                                    <label
                                        htmlFor='directory-latitude'
                                        className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                    >
                                        Latitude
                                    </label>
                                    <Input
                                        id='directory-latitude'
                                        type='number'
                                        step='0.0001'
                                        value={draft.latitude}
                                        onChange={event =>
                                            setDraft(current => ({
                                                ...current,
                                                latitude: event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor='directory-longitude'
                                        className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                    >
                                        Longitude
                                    </label>
                                    <Input
                                        id='directory-longitude'
                                        type='number'
                                        step='0.0001'
                                        value={draft.longitude}
                                        onChange={event =>
                                            setDraft(current => ({
                                                ...current,
                                                longitude: event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor='directory-precision'
                                        className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                    >
                                        Precision km
                                    </label>
                                    <Input
                                        id='directory-precision'
                                        type='number'
                                        min='1'
                                        max='50'
                                        step='0.5'
                                        value={draft.precisionKm}
                                        onChange={event =>
                                            setDraft(current => ({
                                                ...current,
                                                precisionKm:
                                                    event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                            </div>
                            <p className='text-xs text-mh-textSoft'>
                                Coordinates are published only at a precision
                                of one kilometre or broader.
                            </p>
                            <div className='grid gap-4 md:grid-cols-2'>
                                <div>
                                    <label
                                        htmlFor='directory-hours'
                                        className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                    >
                                        Open hours
                                    </label>
                                    <textarea
                                        id='directory-hours'
                                        className='mh-input min-h-24 w-full px-3 py-2'
                                        value={draft.openHours}
                                        onChange={event =>
                                            setDraft(current => ({
                                                ...current,
                                                openHours: event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor='directory-eligibility'
                                        className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                    >
                                        Eligibility notes
                                    </label>
                                    <textarea
                                        id='directory-eligibility'
                                        className='mh-input min-h-24 w-full px-3 py-2'
                                        value={draft.eligibilityNotes}
                                        onChange={event =>
                                            setDraft(current => ({
                                                ...current,
                                                eligibilityNotes:
                                                    event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                            </div>
                            <div>
                                <label
                                    htmlFor='directory-operational-status'
                                    className='mb-2 block text-xs font-bold uppercase tracking-[0.12em]'
                                >
                                    Operational status
                                </label>
                                <select
                                    id='directory-operational-status'
                                    className='mh-input w-full px-3 py-2 text-base md:max-w-xs'
                                    value={draft.operationalStatus}
                                    onChange={event =>
                                        setDraft(current => ({
                                            ...current,
                                            operationalStatus: event.target
                                                .value as DirectoryResourceDraft['operationalStatus'],
                                        }))
                                    }
                                >
                                    {directoryOperationalStatuses.map(
                                        status => (
                                            <option key={status} value={status}>
                                                {formatCategoryLabel(status)}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </div>
                            {issues.length > 0 ?
                                <div role='alert' className='mh-alert text-xs'>
                                    <p className='font-bold'>
                                        Check the public listing:
                                    </p>
                                    <ul className='mt-2 list-disc space-y-1 pl-5'>
                                        {issues.map(issue => (
                                            <li key={issue}>{issue}</li>
                                        ))}
                                    </ul>
                                </div>
                            :   null}
                            <div className='flex flex-wrap gap-2'>
                                <Button
                                    type='submit'
                                    variant='primary'
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ?
                                        'Saving…'
                                    : editing ?
                                        'Save resource'
                                    :   'Publish resource'}
                                </Button>
                                <Button
                                    type='button'
                                    variant='neutral'
                                    disabled={isSubmitting}
                                    onClick={() => {
                                        reset();
                                        setIsOpen(false);
                                    }}
                                >
                                    Cancel
                                </Button>
                                {editing && !confirmDelete ?
                                    <Button
                                        type='button'
                                        variant='neutral'
                                        disabled={isSubmitting}
                                        onClick={() => setConfirmDelete(true)}
                                    >
                                        Delete resource
                                    </Button>
                                :   null}
                            </div>
                            {editing && confirmDelete ?
                                <div
                                    role='alert'
                                    className='mh-alert flex flex-wrap items-center gap-3 text-xs'
                                >
                                    <p className='font-bold'>
                                        Delete this public AT record?
                                    </p>
                                    <Button
                                        type='button'
                                        variant='primary'
                                        disabled={isSubmitting}
                                        onClick={() => void remove()}
                                    >
                                        Confirm delete
                                    </Button>
                                    <Button
                                        type='button'
                                        variant='neutral'
                                        onClick={() =>
                                            setConfirmDelete(false)
                                        }
                                    >
                                        Keep resource
                                    </Button>
                                </div>
                            :   null}
                        </form>
                    :   null}
                    <span className='sr-only' data-directory-manager='ready'>
                        Directory manager ready
                    </span>
                </>
            :   <p className='text-sm text-mh-textMuted'>
                    Directory browsing is public.{' '}
                    <a
                        className='font-bold underline'
                        href='/login?returnTo=%2Fresources'
                    >
                        Sign in
                    </a>{' '}
                    to publish or manage a resource.
                </p>
            }
        </Card>
    );
};

interface ResourceRouteProps {
    discoveryState: DiscoveryFilterState;
    onPatchDiscovery: (patch: Partial<DiscoveryFilterState>) => void;
    onNavigate: (route: AppRoute) => void;
    isLoading: boolean;
    errorMessage?: string;
    dataOrigin: ApiDataOrigin;
    onRetry: () => void;
    resourceCards: readonly ResourceDirectoryCard[];
    currentUserDid: string;
}

const ResourceRoute = ({
    discoveryState,
    onPatchDiscovery,
    onNavigate,
    isLoading,
    errorMessage,
    dataOrigin,
    onRetry,
    resourceCards,
    currentUserDid,
}: ResourceRouteProps) => {
    const [activeCategory, setActiveCategory] =
        useState<DirectoryResourceCategory>();
    const [selectedUri, setSelectedUri] = useState<string>();
    const [manageUri, setManageUri] = useState<string>();

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
        [
            errorMessage,
            isLoading,
            viewModel.cards,
            viewModel.activeCategoryFilter,
        ],
    );

    const detailPanel =
        selectedUri ?
            openResourceDetailPanel(viewModel.cards, selectedUri)
        :   closeResourceDetailPanel();

    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>
                    Resource directory
                </h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Overlay verified services on map context and launch intake
                    handoffs quickly.
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                    <Badge tone={dataOrigin === 'api' ? 'success' : 'info'}>
                        {dataOriginLabel(dataOrigin)}
                    </Badge>
                </div>
                {errorMessage ?
                    <div
                        role='alert'
                        className='mh-alert mt-3 text-xs font-bold'
                    >
                        <p>API sync issue: {errorMessage}</p>
                        {resourceCards.length > 0 ?
                            <p>
                                Showing previously loaded results; they may be
                                stale.
                            </p>
                        :   null}
                        <Button
                            type='button'
                            variant='neutral'
                            className='mt-2 px-3 py-1 text-xs'
                            onClick={onRetry}
                        >
                            Retry directory
                        </Button>
                    </div>
                :   null}
            </header>

            <DirectoryResourceManager
                currentUserDid={currentUserDid}
                center={discoveryState.center ?? defaultDiscoveryCenter}
                onChanged={onRetry}
                editUri={manageUri}
                onEditHandled={() => setManageUri(undefined)}
            />

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
                                className='mh-record-card'
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
                                className='mh-record-card'
                            >
                                <div className='flex flex-wrap items-start justify-between gap-2'>
                                    <p className='text-sm font-bold text-mh-text'>
                                        {card.name}
                                    </p>
                                    <Badge tone='info'>
                                        {formatCategoryLabel(card.category)}
                                    </Badge>
                                    {card.recordOrigin === 'synthetic' ?
                                        <Badge tone='info'>
                                            Synthetic showcase
                                        </Badge>
                                    : card.recordOrigin === 'sourced-public' ?
                                        <Badge tone='info'>
                                            Public-source reference
                                        </Badge>
                                    :   null}
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
                                    {currentUserDid &&
                                    (card.authorDid === currentUserDid ||
                                        card.uri.startsWith(
                                            `at://${currentUserDid}/`,
                                        )) ?
                                        <Button
                                            variant='neutral'
                                            className='px-3 py-1 text-xs'
                                            onClick={() => setManageUri(card.uri)}
                                        >
                                            Manage listing
                                        </Button>
                                    :   null}
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
                    {detailPanel.exactPublicAddress ?
                        <div className='mh-alert mt-3 text-sm'>
                            <p className='font-bold'>
                                Moderator-approved public address
                            </p>
                            <p>{detailPanel.exactPublicAddress}</p>
                            <p className='mt-1 text-xs text-mh-textSoft'>
                                Approval expires{' '}
                                {formatDateTime(
                                    detailPanel.exactAddressApprovalExpiresAt ??
                                        '',
                                )}
                                . This is a public resource address, not a
                                person&apos;s location.
                            </p>
                        </div>
                    :   null}
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

const LegacyFixtureVolunteerRoute = ({ did }: { did: string }) => {
    const [draft, setDraft] = useState<VolunteerOnboardingDraft>(() => ({
        did,
        displayName: '',
        capabilities: [],
        availability: 'within-24h',
        contactPreference: 'chat-only',
        skills: [],
        availabilityWindows: [],
        preferredCategories: [],
        preferredUrgencies: [],
        maxDistanceKm: 5,
        acceptsLateNight: false,
        checkpoints: {
            identityCheck: 'pending',
            safetyTraining: 'pending',
            communityReference: 'pending',
        },
        notes: '',
    }));
    const [skillsText, setSkillsText] = useState('');
    const [windowsText, setWindowsText] = useState('');
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
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>
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

const emptyVolunteerCommand = (): VolunteerProfileCommandInput => ({
    profile: {
        displayName: '',
        bio: '',
        capabilities: [],
        availability: 'within-24h',
        contactPreference: 'chat-only',
        skills: [],
        languages: ['en'],
    },
    privateProfile: {
        contactEmail: null,
        contactPhone: null,
        availabilityWindows: [],
        matchingPreferences: {
            preferredCategories: ['other'],
            preferredUrgencies: ['medium'],
            maxDistanceKm: 10,
            acceptsLateNight: false,
        },
    },
});

const VolunteerRoute = ({ did }: { did: string }) => {
    const [profiles, setProfiles] = useState<VolunteerDiscoveryProfile[]>([]);
    const [discoveryStatus, setDiscoveryStatus] =
        useState('Loading volunteer profiles…');
    const [searchText, setSearchText] = useState('');
    const [command, setCommand] = useState<VolunteerProfileCommandInput>(
        emptyVolunteerCommand,
    );
    const [owned, setOwned] = useState<AtVolunteerProfileResult>();
    const [skillsText, setSkillsText] = useState('');
    const [languagesText, setLanguagesText] = useState('en');
    const [windowsText, setWindowsText] = useState('');
    const [formStatus, setFormStatus] = useState<string>();

    const loadProfiles = useCallback(async () => {
        setDiscoveryStatus('Loading volunteer profiles…');
        const result = await fetchVolunteerProfilesViaApi({ searchText });
        if (!result.ok) {
            setDiscoveryStatus(`Error: ${result.error}`);
            return;
        }
        setProfiles(result.data);
        setDiscoveryStatus(
            result.data.length === 0 ?
                'No volunteer profiles match these filters.'
            :   `${result.data.length} volunteer profile${result.data.length === 1 ? '' : 's'}.`,
        );
        const mine = result.data.find(profile => profile.authorDid === did);
        if (!mine || !did) return;
        const ownedResult = await getAtVolunteerProfileViaApi(mine.uri);
        if (!ownedResult.ok) return;
        setOwned(ownedResult.data);
        const record = ownedResult.data.record;
        setCommand({
            profile: {
                displayName: record.displayName,
                bio: record.bio ?? '',
                capabilities: [...record.capabilities],
                availability: record.availability,
                contactPreference: record.contactPreference,
                skills: [...(record.skills ?? [])],
                languages: [...(record.languages ?? [])],
                serviceArea: record.serviceArea,
            },
            privateProfile:
                ownedResult.data.privateProfile ??
                emptyVolunteerCommand().privateProfile,
        });
        setSkillsText((record.skills ?? []).join(', '));
        setLanguagesText((record.languages ?? []).join(', '));
        setWindowsText(
            (
                ownedResult.data.privateProfile?.availabilityWindows ??
                []
            ).join(', '),
        );
    }, [did, searchText]);

    useEffect(() => {
        void loadProfiles();
    }, [loadProfiles]);

    const updateProfile = (
        patch: Partial<VolunteerProfileCommandInput['profile']>,
    ) =>
        setCommand(current => ({
            ...current,
            profile: { ...current.profile, ...patch },
        }));

    const save = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const next: VolunteerProfileCommandInput = {
            ...command,
            profile: {
                ...command.profile,
                skills: parseCommaList(skillsText),
                languages: parseCommaList(languagesText),
                serviceArea:
                    command.profile.serviceArea?.areaLabel.trim() ?
                        command.profile.serviceArea
                    :   undefined,
            },
            privateProfile: {
                ...command.privateProfile,
                availabilityWindows: parseCommaList(windowsText),
            },
        };
        setFormStatus('Saving volunteer profile…');
        const result =
            owned ?
                await updateAtVolunteerProfileViaApi({
                    ...next,
                    uri: owned.uri,
                    expectedCid: owned.cid,
                })
            :   await createAtVolunteerProfileViaApi(next);
        if (!result.ok) {
            setFormStatus(`Error: ${result.error}`);
            return;
        }
        setOwned(result.data);
        setCommand(next);
        setFormStatus(
            owned ? 'Volunteer profile updated.' : 'Volunteer profile published.',
        );
        await loadProfiles();
    };

    const remove = async () => {
        if (!owned) return;
        setFormStatus('Deleting volunteer profile…');
        const result = await deleteAtVolunteerProfileViaApi({
            uri: owned.uri,
            expectedCid: owned.cid,
        });
        if (!result.ok) {
            setFormStatus(`Error: ${result.error}`);
            return;
        }
        setOwned(undefined);
        setCommand(emptyVolunteerCommand());
        setSkillsText('');
        setLanguagesText('en');
        setWindowsText('');
        setFormStatus('Volunteer profile deleted.');
        await loadProfiles();
    };

    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>Volunteer profiles</h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Discover public skills and approximate service areas.
                    Private contact and matching preferences are visible only
                    to the profile owner and authorized workflows.
                </p>
            </header>

            <Panel title='Find volunteers'>
                <form
                    className='flex flex-wrap gap-2'
                    onSubmit={event => {
                        event.preventDefault();
                        void loadProfiles();
                    }}
                >
                    <label className='grow text-sm font-bold'>
                        Search public profiles
                        <Input
                            value={searchText}
                            onChange={event => setSearchText(event.target.value)}
                        />
                    </label>
                    <Button type='submit'>Search</Button>
                </form>
                <p
                    className='mt-3 text-sm text-mh-textMuted'
                    role={discoveryStatus.startsWith('Error:') ? 'alert' : 'status'}
                >
                    {discoveryStatus}
                </p>
                <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                    {profiles.map(profile => (
                        <Card key={profile.uri} title={profile.displayName}>
                            {profile.recordOrigin === 'synthetic' ?
                                <Badge tone='info'>Synthetic showcase</Badge>
                            : profile.recordOrigin === 'sourced-public' ?
                                <Badge tone='info'>
                                    Public-source reference
                                </Badge>
                            :   null}
                            <p className='text-sm'>{profile.bio}</p>
                            <p className='mt-2 text-xs text-mh-textMuted'>
                                {profile.capabilities.join(', ')} ·{' '}
                                {profile.availability}
                            </p>
                            <p className='mt-1 text-xs text-mh-textMuted'>
                                Languages: {profile.languages.join(', ') || 'not listed'}
                            </p>
                            {profile.serviceArea ?
                                <p className='mt-1 text-xs text-mh-textMuted'>
                                    Service area: {profile.serviceArea.areaLabel}
                                    {profile.serviceArea.noPermanentAddress ?
                                        ' · no permanent address'
                                    :   ''}
                                </p>
                            :   null}
                        </Card>
                    ))}
                </div>
            </Panel>

            {did ?
                <Panel title={owned ? 'Manage my profile' : 'Create my profile'}>
                    <form className='space-y-4' onSubmit={save}>
                        <div className='grid gap-3 sm:grid-cols-2'>
                            <label className='text-sm font-bold'>
                                Display name
                                <Input
                                    value={command.profile.displayName}
                                    onChange={event =>
                                        updateProfile({
                                            displayName: event.target.value,
                                        })
                                    }
                                />
                            </label>
                            <label className='text-sm font-bold'>
                                Availability
                                <select
                                    className='mh-input mt-1 w-full px-3 py-2'
                                    value={command.profile.availability}
                                    onChange={event =>
                                        updateProfile({
                                            availability: event.target
                                                .value as VolunteerProfileCommandInput['profile']['availability'],
                                        })
                                    }
                                >
                                    {volunteerAvailabilityOptions.map(value => (
                                        <option key={value} value={value}>
                                            {formatCategoryLabel(value)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <label className='block text-sm font-bold'>
                            Public bio
                            <textarea
                                className='mh-input mt-1 min-h-24 w-full px-3 py-2'
                                value={command.profile.bio ?? ''}
                                onChange={event =>
                                    updateProfile({ bio: event.target.value })
                                }
                            />
                        </label>
                        <fieldset>
                            <legend className='text-sm font-bold'>
                                Public capabilities
                            </legend>
                            <div className='mt-2 flex flex-wrap gap-2'>
                                {volunteerCapabilityOptions.map(value => (
                                    <label key={value} className='text-sm'>
                                        <input
                                            type='checkbox'
                                            checked={command.profile.capabilities.includes(value)}
                                            onChange={() =>
                                                updateProfile({
                                                    capabilities: toggleInList(
                                                        command.profile.capabilities,
                                                        value,
                                                    ) as VolunteerProfileCommandInput['profile']['capabilities'],
                                                })
                                            }
                                        />{' '}
                                        {formatCategoryLabel(value)}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        <div className='grid gap-3 sm:grid-cols-2'>
                            <label className='text-sm font-bold'>
                                Public skills
                                <Input
                                    value={skillsText}
                                    onChange={event => setSkillsText(event.target.value)}
                                    placeholder='meal delivery, route planning'
                                />
                            </label>
                            <label className='text-sm font-bold'>
                                Public languages
                                <Input
                                    value={languagesText}
                                    onChange={event => setLanguagesText(event.target.value)}
                                    placeholder='en, es'
                                />
                            </label>
                            <label className='text-sm font-bold'>
                                Approximate service-area label
                                <Input
                                    value={command.profile.serviceArea?.areaLabel ?? ''}
                                    onChange={event =>
                                        updateProfile({
                                            serviceArea: {
                                                ...(command.profile.serviceArea ?? {
                                                    noPermanentAddress: false,
                                                }),
                                                areaLabel: event.target.value,
                                            },
                                        })
                                    }
                                />
                            </label>
                            <label className='text-sm font-bold'>
                                Precision (km, minimum 1)
                                <Input
                                    type='number'
                                    min={1}
                                    value={command.profile.serviceArea?.precisionKm ?? 2}
                                    onChange={event =>
                                        updateProfile({
                                            serviceArea: {
                                                ...(command.profile.serviceArea ?? {
                                                    areaLabel: '',
                                                    noPermanentAddress: false,
                                                }),
                                                precisionKm: Number(event.target.value),
                                            },
                                        })
                                    }
                                />
                            </label>
                            <label className='text-sm font-bold'>
                                Approximate latitude
                                <Input
                                    type='number'
                                    step='0.01'
                                    value={command.profile.serviceArea?.latitude ?? ''}
                                    onChange={event =>
                                        updateProfile({
                                            serviceArea: {
                                                ...(command.profile.serviceArea ?? {
                                                    areaLabel: '',
                                                    noPermanentAddress: false,
                                                }),
                                                precisionKm:
                                                    command.profile.serviceArea
                                                        ?.precisionKm ?? 2,
                                                latitude: Number(event.target.value),
                                            },
                                        })
                                    }
                                />
                            </label>
                            <label className='text-sm font-bold'>
                                Approximate longitude
                                <Input
                                    type='number'
                                    step='0.01'
                                    value={command.profile.serviceArea?.longitude ?? ''}
                                    onChange={event =>
                                        updateProfile({
                                            serviceArea: {
                                                ...(command.profile.serviceArea ?? {
                                                    areaLabel: '',
                                                    noPermanentAddress: false,
                                                }),
                                                precisionKm:
                                                    command.profile.serviceArea
                                                        ?.precisionKm ?? 2,
                                                longitude: Number(event.target.value),
                                            },
                                        })
                                    }
                                />
                            </label>
                        </div>
                        <label className='block text-sm'>
                            <input
                                type='checkbox'
                                checked={
                                    command.profile.serviceArea
                                        ?.noPermanentAddress ?? false
                                }
                                onChange={event =>
                                    updateProfile({
                                        serviceArea: {
                                            ...(command.profile.serviceArea ?? {
                                                areaLabel: '',
                                            }),
                                            noPermanentAddress:
                                                event.target.checked,
                                        },
                                    })
                                }
                            />{' '}
                            I do not have a permanent address
                        </label>
                        <Card title='Private operational details'>
                            <div className='grid gap-3 sm:grid-cols-2'>
                                <label className='text-sm font-bold'>
                                    Private contact email
                                    <Input
                                        type='email'
                                        value={command.privateProfile.contactEmail ?? ''}
                                        onChange={event =>
                                            setCommand(current => ({
                                                ...current,
                                                privateProfile: {
                                                    ...current.privateProfile,
                                                    contactEmail:
                                                        event.target.value || null,
                                                },
                                            }))
                                        }
                                    />
                                </label>
                                <label className='text-sm font-bold'>
                                    Private availability windows
                                    <Input
                                        value={windowsText}
                                        onChange={event => setWindowsText(event.target.value)}
                                    />
                                </label>
                            </div>
                        </Card>
                        <div className='flex flex-wrap items-center gap-2'>
                            <Button type='submit'>
                                {owned ? 'Save profile' : 'Publish profile'}
                            </Button>
                            {owned ?
                                <Button
                                    type='button'
                                    variant='neutral'
                                    onClick={() => void remove()}
                                >
                                    Delete profile
                                </Button>
                            :   null}
                            {formStatus ?
                                <span
                                    role={formStatus.startsWith('Error:') ? 'alert' : 'status'}
                                    className='text-sm'
                                >
                                    {formStatus}
                                </span>
                            :   null}
                        </div>
                    </form>
                </Panel>
            :   <Panel title='Sign in to volunteer'>
                    <p>Create and manage a profile with your AT identity.</p>
                </Panel>}
        </section>
    );
};

const VerificationRoute = ({ did }: { did: string }) => {
    const [workspace, setWorkspace] = useState<VerificationWorkspace>();
    const [review, setReview] = useState<VerificationReviewQueue>();
    const [attachments, setAttachments] = useState<PrivateAttachment[]>([]);
    const evidenceFileRef = useRef<HTMLInputElement>(null);
    const [accessUrls, setAccessUrls] = useState<Record<string, string>>({});
    const [exactReview, setExactReview] =
        useState<ExactAddressRequest[]>();
    const [status, setStatus] = useState('Loading private verification status…');
    const [subjectType, setSubjectType] =
        useState<VerificationSubjectType>('volunteer');
    const [organizationId, setOrganizationId] = useState('');
    const [resourceUri, setResourceUri] = useState('');
    const [evidenceLabel, setEvidenceLabel] = useState('');
    const [evidenceIssuer, setEvidenceIssuer] = useState('');
    const [privateNotes, setPrivateNotes] = useState('');
    const [attachmentId, setAttachmentId] = useState('');
    const [appealApplicationId, setAppealApplicationId] = useState('');
    const [appealReason, setAppealReason] = useState('');
    const [streetAddress, setStreetAddress] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [confidentialFacility, setConfidentialFacility] = useState(false);
    const [reviewReason, setReviewReason] = useState(
        'Evidence reviewed against the verification policy.',
    );
    const loadSequence = useRef(0);

    const load = useCallback(async () => {
        if (!did) return;
        const sequence = ++loadSequence.current;
        setStatus('Loading private verification status…');
        const [mine, privateFiles] = await Promise.all([
            fetchVerificationWorkspaceViaApi(),
            fetchPrivateAttachmentsViaApi(),
        ]);
        if (sequence !== loadSequence.current) return;
        if (!mine.ok) {
            setStatus(`Error: ${mine.error}`);
            return;
        }
        setWorkspace(mine.data);
        if (privateFiles.ok) {
            setAttachments(privateFiles.data);
        } else {
            setStatus(`Error: ${privateFiles.error}`);
            return;
        }
        setStatus('Verification status loaded.');

        const [verificationQueue, exactQueue] = await Promise.all([
            fetchVerificationReviewQueueViaApi(),
            fetchExactAddressReviewQueueViaApi(),
        ]);
        if (sequence !== loadSequence.current) return;
        setReview(verificationQueue.ok ? verificationQueue.data : undefined);
        setExactReview(exactQueue.ok ? exactQueue.data : undefined);
    }, [did]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!did) {
        return (
            <Panel title='Sign in to manage verification'>
                <p className='text-sm text-mh-textMuted'>
                    Verification evidence, decisions, appeals, and exact-address
                    requests are private authenticated workflows.
                </p>
                <a className='mh-text-link mt-3 inline-block' href='/login'>
                    Sign in
                </a>
            </Panel>
        );
    }

    const submitApplication = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus('Submitting verification application…');
        const result = await submitVerificationApplicationViaApi({
            subjectType,
            ...(subjectType !== 'volunteer' ? { organizationId } : {}),
            ...(subjectType === 'resource' ? { resourceUri } : {}),
            evidence: [
                {
                    kind:
                        subjectType === 'volunteer' ? 'identity'
                        : subjectType === 'organization' ?
                            'organization-registration'
                        :   'service-authorization',
                    label: evidenceLabel,
                    issuer: evidenceIssuer || null,
                    issuedAt: null,
                    attachmentId: attachmentId || null,
                    privateNotes: privateNotes || null,
                },
            ],
        });
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        setEvidenceLabel('');
        setEvidenceIssuer('');
        setPrivateNotes('');
        setAttachmentId('');
        await load();
        setStatus('Verification application submitted privately.');
    };

    const uploadEvidence = async () => {
        const evidenceFile = evidenceFileRef.current?.files?.[0];
        if (!evidenceFile) {
            setStatus('Error: Choose an image or PDF to upload.');
            return;
        }
        setStatus('Uploading private verification evidence…');
        const result = await uploadPrivateAttachmentViaApi(
            evidenceFile,
            'verification-evidence',
            null,
        );
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        if (evidenceFileRef.current) {
            evidenceFileRef.current.value = '';
        }
        await load();
        setStatus(
            'Evidence uploaded privately and queued for scanning. Refresh until it is clean before submitting.',
        );
    };

    const deleteAttachment = async (attachmentIdToDelete: string) => {
        const result = await deletePrivateAttachmentViaApi(
            attachmentIdToDelete,
        );
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        if (attachmentId === attachmentIdToDelete) {
            setAttachmentId('');
        }
        await load();
        setStatus('Attachment deletion queued for original and derivative bytes.');
    };

    const prepareAccess = async (attachmentIdToOpen: string) => {
        const result = await requestPrivateAttachmentAccessViaApi(
            attachmentIdToOpen,
        );
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        setAccessUrls(current => ({
            ...current,
            [attachmentIdToOpen]: result.data.url,
        }));
        setStatus('Short-lived authenticated access is ready for 60 seconds.');
    };

    const moderateAttachment = async (
        attachmentIdToReview: string,
        action: 'quarantine' | 'release-for-rescan' | 'delete',
    ) => {
        const result = await reviewPrivateAttachmentViaApi(
            attachmentIdToReview,
            action,
            reviewReason,
        );
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        setAccessUrls(current => {
            const next = { ...current };
            delete next[attachmentIdToReview];
            return next;
        });
        await load();
        setStatus(`Attachment ${action} action recorded.`);
    };

    const submitAppeal = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus('Submitting appeal…');
        const result = await submitVerificationAppealViaApi({
            applicationId: appealApplicationId,
            reason: appealReason,
        });
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        setAppealReason('');
        await load();
        setStatus('Appeal submitted for moderator review.');
    };

    const submitExactAddress = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus('Submitting exact public-resource address…');
        const result = await requestExactPublicAddressViaApi({
            organizationId,
            resourceUri,
            streetAddress,
            latitude: Number(latitude),
            longitude: Number(longitude),
            confidentialFacility,
        });
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        setStreetAddress('');
        await load();
        setStatus(
            confidentialFacility ?
                'Confidential address quarantined and kept out of public discovery.'
            :   'Exact address submitted for separate moderator approval.',
        );
    };

    const decideApplication = async (
        application: VerificationApplication,
        action: 'approve' | 'deny' | 'revoke' | 'renew',
    ) => {
        setStatus(`Recording ${action} decision…`);
        const result = await decideVerificationViaApi({
            applicationId: application.id,
            action,
            reason: reviewReason,
        });
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        await load();
        setStatus(`Verification ${action} decision recorded.`);
    };

    const decideAppeal = async (
        appeal: VerificationAppeal,
        decision: 'upheld' | 'denied',
    ) => {
        const result = await decideVerificationAppealViaApi({
            appealId: appeal.id,
            decision,
            resolutionNote: reviewReason,
        });
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        await load();
        setStatus(`Appeal ${decision} decision recorded.`);
    };

    const decideExact = async (
        request: ExactAddressRequest,
        decision: 'approve' | 'reject' | 'revoke',
    ) => {
        const result = await decideExactAddressViaApi({
            requestId: request.id,
            decision,
            reason: reviewReason,
        });
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        await load();
        setStatus(`Exact-address ${decision} decision recorded.`);
    };

    const appealable =
        workspace?.applications.filter(application =>
            ['denied', 'revoked', 'expired'].includes(application.status),
        ) ?? [];

    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>Verification</h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Evidence stays private. Public verification expires
                    annually, and exact resource addresses require a separate
                    moderator approval.
                </p>
                <p
                    role={status.startsWith('Error:') ? 'alert' : 'status'}
                    className='mt-3 text-sm font-bold'
                >
                    {status}
                </p>
            </header>

            <Panel title='Apply for verification'>
                <form className='space-y-3' onSubmit={submitApplication}>
                    <label className='block text-sm font-bold'>
                        Subject
                        <select
                            className='mh-input mt-1 w-full px-3 py-2'
                            value={subjectType}
                            onChange={event =>
                                setSubjectType(
                                    event.target
                                        .value as VerificationSubjectType,
                                )
                            }
                        >
                            <option value='volunteer'>My volunteer identity</option>
                            <option value='organization'>Organization</option>
                            <option value='resource'>Organization resource</option>
                        </select>
                    </label>
                    {subjectType !== 'volunteer' ?
                        <label className='block text-sm font-bold'>
                            Organization ID
                            <Input
                                className='mt-1'
                                required
                                value={organizationId}
                                onChange={event =>
                                    setOrganizationId(event.target.value)
                                }
                            />
                        </label>
                    :   null}
                    {subjectType === 'resource' ?
                        <label className='block text-sm font-bold'>
                            Resource AT URI
                            <Input
                                className='mt-1'
                                required
                                value={resourceUri}
                                onChange={event =>
                                    setResourceUri(event.target.value)
                                }
                            />
                        </label>
                    :   null}
                    <label className='block text-sm font-bold'>
                        Evidence label
                        <Input
                            className='mt-1'
                            required
                            value={evidenceLabel}
                            onChange={event =>
                                setEvidenceLabel(event.target.value)
                            }
                        />
                    </label>
                    <label className='block text-sm font-bold'>
                        Issuer (optional)
                        <Input
                            className='mt-1'
                            value={evidenceIssuer}
                            onChange={event =>
                                setEvidenceIssuer(event.target.value)
                            }
                        />
                    </label>
                    <Card title='Private evidence file'>
                        <p className='mb-2 text-xs text-mh-textMuted'>
                            Upload first, wait for a clean scan decision, then
                            select the file for this application. Object keys
                            and scanner details never appear here.
                        </p>
                        <div className='flex flex-wrap items-end gap-2'>
                            <label className='min-w-64 flex-1 text-sm font-bold'>
                                Image or PDF
                                <input
                                    className='mt-1'
                                    type='file'
                                    ref={evidenceFileRef}
                                    accept='image/jpeg,image/png,image/gif,image/webp,application/pdf'
                                />
                            </label>
                            <Button
                                type='button'
                                variant='secondary'
                                onClick={() => void uploadEvidence()}
                            >
                                Upload privately
                            </Button>
                            <Button
                                type='button'
                                variant='neutral'
                                onClick={() => void load()}
                            >
                                Refresh scan status
                            </Button>
                        </div>
                        {attachments.length ?
                            <ul className='mt-3 space-y-2'>
                                {attachments.map(attachment => (
                                    <li
                                        className='mh-record-card text-xs'
                                        key={attachment.id}
                                    >
                                        <div className='flex flex-wrap items-center justify-between gap-2'>
                                            <span>
                                                <strong>
                                                    {attachment.filename}
                                                </strong>{' '}
                                                · {attachment.status} ·{' '}
                                                {Math.ceil(
                                                    attachment.byteSize / 1024,
                                                )}{' '}
                                                KB
                                            </span>
                                            <div className='flex flex-wrap gap-2'>
                                                {attachment.status === 'clean' ?
                                                    <Button
                                                        type='button'
                                                        variant='neutral'
                                                        className='px-2 py-1 text-xs'
                                                        onClick={() =>
                                                            void prepareAccess(
                                                                attachment.id,
                                                            )
                                                        }
                                                    >
                                                        Prepare preview
                                                    </Button>
                                                :   null}
                                                <Button
                                                    type='button'
                                                    variant='neutral'
                                                    className='px-2 py-1 text-xs'
                                                    onClick={() =>
                                                        void deleteAttachment(
                                                            attachment.id,
                                                        )
                                                    }
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>
                                        {accessUrls[attachment.id] ?
                                            <a
                                                className='mh-text-link mt-2 inline-block'
                                                href={
                                                    accessUrls[attachment.id]
                                                }
                                                target='_blank'
                                                rel='noreferrer'
                                            >
                                                Open authenticated file
                                            </a>
                                        :   null}
                                    </li>
                                ))}
                            </ul>
                        :   <p className='mt-2 text-xs text-mh-textMuted'>
                                No private files uploaded.
                            </p>}
                    </Card>
                    <label className='block text-sm font-bold'>
                        Clean private attachment (optional)
                        <select
                            className='mh-input mt-1 w-full px-3 py-2'
                            value={attachmentId}
                            onChange={event =>
                                setAttachmentId(event.target.value)
                            }
                        >
                            <option value=''>No file</option>
                            {attachments
                                .filter(
                                    attachment =>
                                        attachment.status === 'clean' &&
                                        attachment.purpose ===
                                            'verification-evidence',
                                )
                                .map(attachment => (
                                    <option
                                        key={attachment.id}
                                        value={attachment.id}
                                    >
                                        {attachment.filename}
                                    </option>
                                ))}
                        </select>
                    </label>
                    <label className='block text-sm font-bold'>
                        Private reviewer notes (optional)
                        <Input
                            className='mt-1'
                            value={privateNotes}
                            onChange={event =>
                                setPrivateNotes(event.target.value)
                            }
                        />
                    </label>
                    <Button type='submit'>Submit private application</Button>
                </form>
            </Panel>

            <Panel title='My status and annual renewal'>
                {workspace?.applications.length ?
                    <ul className='space-y-3'>
                        {workspace.applications.map(application => (
                            <li className='mh-record-card' key={application.id}>
                                <div className='flex flex-wrap justify-between gap-2'>
                                    <strong>
                                        {formatCategoryLabel(
                                            application.subjectType,
                                        )}
                                    </strong>
                                    <Badge
                                        tone={
                                            application.status === 'approved' ?
                                                'success'
                                            : application.status === 'pending' ?
                                                'info'
                                            :   'danger'
                                        }
                                    >
                                        {formatCategoryLabel(
                                            application.status,
                                        )}
                                    </Badge>
                                </div>
                                <p className='mt-2 text-xs text-mh-textMuted'>
                                    Application {application.id}
                                </p>
                                {application.expiresAt ?
                                    <p className='mt-1 text-xs'>
                                        Annual approval expires{' '}
                                        {formatDateTime(application.expiresAt)}
                                    </p>
                                :   null}
                            </li>
                        ))}
                    </ul>
                :   <p className='text-sm text-mh-textMuted'>
                        No verification applications yet.
                    </p>
                }
            </Panel>

            {appealable.length ?
                <Panel title='Appeal a decision'>
                    <form className='space-y-3' onSubmit={submitAppeal}>
                        <label className='block text-sm font-bold'>
                            Application
                            <select
                                className='mh-input mt-1 w-full px-3 py-2'
                                required
                                value={appealApplicationId}
                                onChange={event =>
                                    setAppealApplicationId(event.target.value)
                                }
                            >
                                <option value=''>Choose an application</option>
                                {appealable.map(application => (
                                    <option
                                        key={application.id}
                                        value={application.id}
                                    >
                                        {application.subjectType} —{' '}
                                        {application.status}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className='block text-sm font-bold'>
                            Appeal reason
                            <Input
                                className='mt-1'
                                required
                                value={appealReason}
                                onChange={event =>
                                    setAppealReason(event.target.value)
                                }
                            />
                        </label>
                        <Button type='submit'>Submit appeal</Button>
                    </form>
                </Panel>
            :   null}

            <Panel title='Request an exact public-resource address'>
                <p className='mb-3 text-sm text-mh-textMuted'>
                    Active organization and resource verification are required.
                    Confidential facilities are always quarantined.
                </p>
                <form className='space-y-3' onSubmit={submitExactAddress}>
                    <label className='block text-sm font-bold'>
                        Organization ID
                        <Input
                            className='mt-1'
                            required
                            value={organizationId}
                            onChange={event =>
                                setOrganizationId(event.target.value)
                            }
                        />
                    </label>
                    <label className='block text-sm font-bold'>
                        Resource AT URI
                        <Input
                            className='mt-1'
                            required
                            value={resourceUri}
                            onChange={event => setResourceUri(event.target.value)}
                        />
                    </label>
                    <label className='block text-sm font-bold'>
                        Street address
                        <Input
                            className='mt-1'
                            required
                            value={streetAddress}
                            onChange={event =>
                                setStreetAddress(event.target.value)
                            }
                        />
                    </label>
                    <div className='grid gap-3 sm:grid-cols-2'>
                        <label className='block text-sm font-bold'>
                            Latitude
                            <Input
                                className='mt-1'
                                type='number'
                                step='any'
                                required
                                value={latitude}
                                onChange={event =>
                                    setLatitude(event.target.value)
                                }
                            />
                        </label>
                        <label className='block text-sm font-bold'>
                            Longitude
                            <Input
                                className='mt-1'
                                type='number'
                                step='any'
                                required
                                value={longitude}
                                onChange={event =>
                                    setLongitude(event.target.value)
                                }
                            />
                        </label>
                    </div>
                    <label className='flex items-center gap-2 text-sm font-bold'>
                        <input
                            type='checkbox'
                            checked={confidentialFacility}
                            onChange={event =>
                                setConfidentialFacility(event.target.checked)
                            }
                        />
                        This is a confidential facility
                    </label>
                    <Button type='submit'>Request separate approval</Button>
                </form>
                {workspace?.exactAddressRequests.length ?
                    <ul className='mt-4 space-y-2'>
                        {workspace.exactAddressRequests.map(request => (
                            <li className='mh-record-card' key={request.id}>
                                {request.resourceUri} —{' '}
                                <strong>{request.status}</strong>
                            </li>
                        ))}
                    </ul>
                :   null}
            </Panel>

            {review || exactReview ?
                <Panel title='Moderator review'>
                    <p className='mb-3 text-sm text-mh-textMuted'>
                        This section appears only for authorized reviewers.
                        Evidence metadata is never included in public discovery.
                    </p>
                    <label className='block text-sm font-bold'>
                        Decision rationale
                        <Input
                            className='mt-1'
                            required
                            value={reviewReason}
                            onChange={event =>
                                setReviewReason(event.target.value)
                            }
                        />
                    </label>
                    <div className='mt-4 space-y-3'>
                        {review?.applications.map(application => (
                            <Card
                                key={application.id}
                                title={`${application.subjectType} verification`}
                            >
                                <p className='text-xs'>
                                    {application.applicantDid} ·{' '}
                                    {application.status}
                                </p>
                                <ul className='my-2 text-xs'>
                                    {review.evidence
                                        .filter(
                                            item =>
                                                item.applicationId ===
                                                application.id,
                                        )
                                        .map(item => (
                                            <li key={item.id}>
                                                {item.label}
                                                {item.attachment ?
                                                    ` — attachment ${item.attachment.status}`
                                                :   ''}
                                                {item.attachment ?
                                                    <div className='mt-1 flex flex-wrap gap-2'>
                                                        {item.attachment
                                                            .status ===
                                                        'clean' ?
                                                            <Button
                                                                type='button'
                                                                variant='neutral'
                                                                className='px-2 py-1 text-xs'
                                                                onClick={() =>
                                                                    void prepareAccess(
                                                                        item
                                                                            .attachment!
                                                                            .id,
                                                                    )
                                                                }
                                                            >
                                                                Prepare file
                                                            </Button>
                                                        :   null}
                                                        <Button
                                                            type='button'
                                                            variant='neutral'
                                                            className='px-2 py-1 text-xs'
                                                            onClick={() =>
                                                                void moderateAttachment(
                                                                    item
                                                                        .attachment!
                                                                        .id,
                                                                    'quarantine',
                                                                )
                                                            }
                                                        >
                                                            Quarantine
                                                        </Button>
                                                        <Button
                                                            type='button'
                                                            variant='neutral'
                                                            className='px-2 py-1 text-xs'
                                                            onClick={() =>
                                                                void moderateAttachment(
                                                                    item
                                                                        .attachment!
                                                                        .id,
                                                                    'release-for-rescan',
                                                                )
                                                            }
                                                        >
                                                            Rescan
                                                        </Button>
                                                        <Button
                                                            type='button'
                                                            variant='neutral'
                                                            className='px-2 py-1 text-xs'
                                                            onClick={() =>
                                                                void moderateAttachment(
                                                                    item
                                                                        .attachment!
                                                                        .id,
                                                                    'delete',
                                                                )
                                                            }
                                                        >
                                                            Delete file
                                                        </Button>
                                                    </div>
                                                :   null}
                                                {item.attachment &&
                                                accessUrls[
                                                    item.attachment.id
                                                ] ?
                                                    <a
                                                        className='mh-text-link mt-1 inline-block'
                                                        href={
                                                            accessUrls[
                                                                item.attachment
                                                                    .id
                                                            ]
                                                        }
                                                        target='_blank'
                                                        rel='noreferrer'
                                                    >
                                                        Open authenticated file
                                                    </a>
                                                :   null}
                                            </li>
                                        ))}
                                </ul>
                                <div className='flex flex-wrap gap-2'>
                                    {application.status === 'approved' ?
                                        <>
                                            <Button
                                                onClick={() =>
                                                    void decideApplication(
                                                        application,
                                                        'renew',
                                                    )
                                                }
                                            >
                                                Renew one year
                                            </Button>
                                            <Button
                                                variant='neutral'
                                                onClick={() =>
                                                    void decideApplication(
                                                        application,
                                                        'revoke',
                                                    )
                                                }
                                            >
                                                Revoke
                                            </Button>
                                        </>
                                    :   <>
                                            <Button
                                                onClick={() =>
                                                    void decideApplication(
                                                        application,
                                                        'approve',
                                                    )
                                                }
                                            >
                                                Approve one year
                                            </Button>
                                            <Button
                                                variant='neutral'
                                                onClick={() =>
                                                    void decideApplication(
                                                        application,
                                                        'deny',
                                                    )
                                                }
                                            >
                                                Deny
                                            </Button>
                                        </>
                                    }
                                </div>
                            </Card>
                        ))}
                        {review?.appeals.map(appeal => (
                            <Card key={appeal.id} title='Verification appeal'>
                                <p className='text-sm'>{appeal.reason}</p>
                                <div className='mt-2 flex gap-2'>
                                    <Button
                                        onClick={() =>
                                            void decideAppeal(appeal, 'upheld')
                                        }
                                    >
                                        Uphold appeal
                                    </Button>
                                    <Button
                                        variant='neutral'
                                        onClick={() =>
                                            void decideAppeal(appeal, 'denied')
                                        }
                                    >
                                        Deny appeal
                                    </Button>
                                </div>
                            </Card>
                        ))}
                        {exactReview?.map(request => (
                            <Card key={request.id} title='Exact-address review'>
                                <p className='text-sm'>
                                    {request.streetAddress} ·{' '}
                                    {request.resourceUri}
                                </p>
                                {request.confidentialFacility ?
                                    <p className='mh-alert mt-2 text-xs font-bold'>
                                        Confidential: approval is prohibited.
                                    </p>
                                :   null}
                                <div className='mt-2 flex gap-2'>
                                    <Button
                                        disabled={request.confidentialFacility}
                                        onClick={() =>
                                            void decideExact(request, 'approve')
                                        }
                                    >
                                        Approve public address
                                    </Button>
                                    <Button
                                        variant='neutral'
                                        onClick={() =>
                                            void decideExact(request, 'reject')
                                        }
                                    >
                                        Reject
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </Panel>
            :   null}
        </section>
    );
};

const organizationAdminRoles = new Set(['owner', 'admin']);

const OrganizationsRoute = ({ did }: { did: string }) => {
    const [organizations, setOrganizations] = useState<PublicOrganization[]>([]);
    const [mine, setMine] = useState<MyOrganization[]>([]);
    const [members, setMembers] = useState<OrganizationMember[]>([]);
    const [stewardships, setStewardships] = useState<
        OrganizationStewardship[]
    >([]);
    const [selectedId, setSelectedId] = useState('');
    const [searchText, setSearchText] = useState('');
    const [status, setStatus] = useState('Loading organizations…');
    const [actionStatus, setActionStatus] = useState<string>();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [inviteeDid, setInviteeDid] = useState('');
    const [inviteRole, setInviteRole] = useState<
        'admin' | 'steward' | 'member'
    >('steward');
    const [invitationToken, setInvitationToken] = useState('');
    const [acceptToken, setAcceptToken] = useState('');
    const [resourceUri, setResourceUri] = useState('');
    const [stewardDid, setStewardDid] = useState('');

    const loadPublic = useCallback(async () => {
        setStatus('Loading organizations…');
        const result = await fetchOrganizationsViaApi(searchText);
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        setOrganizations(result.data);
        setStatus(
            result.data.length ?
                `${result.data.length} organization${result.data.length === 1 ? '' : 's'}.`
            :   'No organizations match this search.',
        );
    }, [searchText]);

    const loadPrivate = useCallback(async () => {
        if (!did) {
            setMine([]);
            setMembers([]);
            setStewardships([]);
            return;
        }
        const result = await fetchMyOrganizationsViaApi();
        if (!result.ok) {
            setActionStatus(`Error: ${result.error}`);
            return;
        }
        setMine(result.data);
        const nextSelected =
            result.data.some(item => item.id === selectedId) ?
                selectedId
            :   result.data[0]?.id ?? '';
        setSelectedId(nextSelected);
        if (!nextSelected) {
            setMembers([]);
            setStewardships([]);
            return;
        }
        const [memberResult, stewardshipResult] = await Promise.all([
            fetchOrganizationMembersViaApi(nextSelected),
            fetchOrganizationStewardshipsViaApi(nextSelected),
        ]);
        if (memberResult.ok) setMembers(memberResult.data);
        if (stewardshipResult.ok) setStewardships(stewardshipResult.data);
    }, [did, selectedId]);

    useEffect(() => {
        void loadPublic();
    }, [loadPublic]);

    useEffect(() => {
        void loadPrivate();
    }, [loadPrivate]);

    const selected = mine.find(item => item.id === selectedId);
    const canAdmin =
        selected ?
            organizationAdminRoles.has(selected.membership.role)
        :   false;

    const createOrganization = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setActionStatus('Creating organization…');
        const result = await createOrganizationViaApi({ name, description });
        if (!result.ok) {
            setActionStatus(`Error: ${result.error}`);
            return;
        }
        setName('');
        setDescription('');
        setSelectedId(result.data.organization.id);
        setActionStatus('Organization created.');
        await Promise.all([loadPublic(), loadPrivate()]);
    };

    const invite = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selected) return;
        setActionStatus('Creating invitation…');
        const result = await inviteOrganizationMemberViaApi({
            organizationId: selected.id,
            inviteeDid,
            role: inviteRole,
        });
        if (!result.ok) {
            setActionStatus(`Error: ${result.error}`);
            return;
        }
        setInvitationToken(result.data.token);
        setInviteeDid('');
        setActionStatus(
            'Invitation created. Share the one-time token privately with the named AT account.',
        );
    };

    const acceptInvitation = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setActionStatus('Accepting invitation…');
        const result = await acceptOrganizationInvitationViaApi(acceptToken);
        if (!result.ok) {
            setActionStatus(`Error: ${result.error}`);
            return;
        }
        setAcceptToken('');
        setSelectedId(result.data.organizationId);
        setActionStatus('Organization invitation accepted.');
        await loadPrivate();
    };

    const assignStewardship = async (
        event: FormEvent<HTMLFormElement>,
    ) => {
        event.preventDefault();
        if (!selected) return;
        setActionStatus('Assigning resource stewardship…');
        const result = await assignOrganizationStewardshipViaApi({
            organizationId: selected.id,
            resourceUri,
            stewardDid,
        });
        if (!result.ok) {
            setActionStatus(`Error: ${result.error}`);
            return;
        }
        setResourceUri('');
        setStewardDid('');
        setActionStatus('Resource stewardship assigned.');
        await loadPrivate();
    };

    const reconfirm = async (item: OrganizationStewardship) => {
        setActionStatus('Reconfirming resource…');
        const result = await reconfirmOrganizationStewardshipViaApi({
            organizationId: item.organizationId,
            stewardshipId: item.id,
        });
        if (!result.ok) {
            setActionStatus(`Error: ${result.error}`);
            return;
        }
        setActionStatus('Resource reconfirmed for 90 days.');
        await loadPrivate();
    };

    const updateMemberRole = async (
        member: OrganizationMember,
        role: 'admin' | 'steward' | 'member',
    ) => {
        setActionStatus('Updating member role…');
        const result = await updateOrganizationMemberRoleViaApi({
            organizationId: member.organizationId,
            memberDid: member.memberDid,
            role,
        });
        if (!result.ok) {
            setActionStatus(`Error: ${result.error}`);
            return;
        }
        setActionStatus('Organization member role updated.');
        await loadPrivate();
    };

    const removeMember = async (member: OrganizationMember) => {
        setActionStatus('Removing organization member…');
        const result = await removeOrganizationMemberViaApi({
            organizationId: member.organizationId,
            memberDid: member.memberDid,
        });
        if (!result.ok) {
            setActionStatus(`Error: ${result.error}`);
            return;
        }
        setActionStatus('Organization member removed.');
        await loadPrivate();
    };

    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>Organizations</h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Public listings include their origin and provenance. A
                    listing is informational and is not a Patchwork
                    endorsement.
                </p>
            </header>

            <Panel title='Find organizations'>
                <form
                    className='flex flex-wrap gap-2'
                    onSubmit={event => {
                        event.preventDefault();
                        void loadPublic();
                    }}
                >
                    <label className='grow text-sm font-bold'>
                        Search organizations
                        <Input
                            value={searchText}
                            onChange={event => setSearchText(event.target.value)}
                        />
                    </label>
                    <Button type='submit'>Search</Button>
                </form>
                <p
                    className='mt-3 text-sm text-mh-textMuted'
                    role={status.startsWith('Error:') ? 'alert' : 'status'}
                >
                    {status}
                </p>
                <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                    {organizations.map(organization => (
                        <Card key={organization.id} title={organization.name}>
                            <p className='text-sm'>
                                {organization.description}
                            </p>
                            <p className='mt-2 text-xs font-bold text-mh-textMuted'>
                                Origin: {formatCategoryLabel(organization.origin)}
                            </p>
                            {organization.provenance ?
                                <p className='mt-1 text-xs text-mh-textMuted'>
                                    Source:{' '}
                                    <a
                                        className='mh-link'
                                        href={organization.provenance.sourceUrl}
                                        rel='noreferrer'
                                        target='_blank'
                                    >
                                        authoritative public record
                                    </a>{' '}
                                    · last verified{' '}
                                    {new Date(
                                        organization.provenance.lastVerifiedAt,
                                    ).toLocaleDateString()}
                                </p>
                            :   null}
                            <p className='mt-2 text-xs text-mh-textMuted'>
                                {organization.nonEndorsementLabel}
                            </p>
                        </Card>
                    ))}
                </div>
            </Panel>

            {did ?
                <>
                    <Panel title='Join with an invitation'>
                        <form
                            className='flex flex-wrap gap-2'
                            onSubmit={acceptInvitation}
                        >
                            <label className='grow text-sm font-bold'>
                                Invitation token
                                <Input
                                    value={acceptToken}
                                    onChange={event =>
                                        setAcceptToken(event.target.value)
                                    }
                                />
                            </label>
                            <Button type='submit'>Accept invitation</Button>
                        </form>
                    </Panel>

                    <Panel title='Create an organization'>
                        <form
                            className='space-y-3'
                            onSubmit={createOrganization}
                        >
                            <label className='block text-sm font-bold'>
                                Organization name
                                <Input
                                    value={name}
                                    onChange={event => setName(event.target.value)}
                                />
                            </label>
                            <label className='block text-sm font-bold'>
                                Organization description
                                <textarea
                                    className='mh-input mt-1 min-h-24 w-full px-3 py-2'
                                    value={description}
                                    onChange={event =>
                                        setDescription(event.target.value)
                                    }
                                />
                            </label>
                            <Button type='submit'>Create organization</Button>
                        </form>
                    </Panel>

                    {mine.length ?
                        <Panel title='Manage my organizations'>
                            <label className='block text-sm font-bold'>
                                Organization
                                <select
                                    className='mh-input mt-1 w-full px-3 py-2'
                                    value={selectedId}
                                    onChange={event =>
                                        setSelectedId(event.target.value)
                                    }
                                >
                                    {mine.map(item => (
                                        <option key={item.id} value={item.id}>
                                            {item.name} · {item.membership.role}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {selected ?
                                <>
                                    <p className='mt-3 text-sm'>
                                        Your role:{' '}
                                        <strong>
                                            {formatCategoryLabel(
                                                selected.membership.role,
                                            )}
                                        </strong>
                                    </p>
                                    <ul className='mt-3 space-y-2 text-sm'>
                                        {members.map(member => {
                                            const canManageMember =
                                                canAdmin &&
                                                member.role !== 'owner' &&
                                                (selected.membership.role ===
                                                    'owner' ||
                                                    member.role !== 'admin');
                                            return (
                                                <li
                                                    key={member.memberDid}
                                                    className='flex flex-wrap items-center gap-2'
                                                >
                                                    <span>
                                                        {member.memberDid} ·{' '}
                                                        {member.role}
                                                    </span>
                                                    {canManageMember ?
                                                        <>
                                                            <label className='text-xs font-bold'>
                                                                Role for{' '}
                                                                {member.memberDid}
                                                                <select
                                                                    className='mh-input ml-2 px-2 py-1'
                                                                    value={
                                                                        member.role
                                                                    }
                                                                    onChange={event =>
                                                                        void updateMemberRole(
                                                                            member,
                                                                            event
                                                                                .target
                                                                                .value as
                                                                                | 'admin'
                                                                                | 'steward'
                                                                                | 'member',
                                                                        )
                                                                    }
                                                                >
                                                                    <option value='admin'>
                                                                        Admin
                                                                    </option>
                                                                    <option value='steward'>
                                                                        Steward
                                                                    </option>
                                                                    <option value='member'>
                                                                        Member
                                                                    </option>
                                                                </select>
                                                            </label>
                                                            <Button
                                                                type='button'
                                                                variant='neutral'
                                                                onClick={() =>
                                                                    void removeMember(
                                                                        member,
                                                                    )
                                                                }
                                                            >
                                                                Remove{' '}
                                                                {member.memberDid}
                                                            </Button>
                                                        </>
                                                    :   null}
                                                </li>
                                            );
                                        })}
                                    </ul>

                                    {canAdmin ?
                                        <div className='mt-5 grid gap-5 lg:grid-cols-2'>
                                            <form
                                                className='space-y-3'
                                                onSubmit={invite}
                                            >
                                                <h3 className='font-bold'>
                                                    Invite a member
                                                </h3>
                                                <label className='block text-sm font-bold'>
                                                    Invitee AT DID
                                                    <Input
                                                        value={inviteeDid}
                                                        onChange={event =>
                                                            setInviteeDid(
                                                                event.target.value,
                                                            )
                                                        }
                                                    />
                                                </label>
                                                <label className='block text-sm font-bold'>
                                                    Organization role
                                                    <select
                                                        className='mh-input mt-1 w-full px-3 py-2'
                                                        value={inviteRole}
                                                        onChange={event =>
                                                            setInviteRole(
                                                                event.target
                                                                    .value as typeof inviteRole,
                                                            )
                                                        }
                                                    >
                                                        <option value='admin'>
                                                            Admin
                                                        </option>
                                                        <option value='steward'>
                                                            Steward
                                                        </option>
                                                        <option value='member'>
                                                            Member
                                                        </option>
                                                    </select>
                                                </label>
                                                <Button type='submit'>
                                                    Create invitation
                                                </Button>
                                                {invitationToken ?
                                                    <label className='block text-sm font-bold'>
                                                        One-time invitation token
                                                        <Input
                                                            readOnly
                                                            value={invitationToken}
                                                        />
                                                    </label>
                                                :   null}
                                            </form>

                                            <form
                                                className='space-y-3'
                                                onSubmit={assignStewardship}
                                            >
                                                <h3 className='font-bold'>
                                                    Assign resource stewardship
                                                </h3>
                                                <label className='block text-sm font-bold'>
                                                    Public resource AT URI
                                                    <Input
                                                        value={resourceUri}
                                                        onChange={event =>
                                                            setResourceUri(
                                                                event.target.value,
                                                            )
                                                        }
                                                    />
                                                </label>
                                                <label className='block text-sm font-bold'>
                                                    Steward AT DID
                                                    <Input
                                                        value={stewardDid}
                                                        onChange={event =>
                                                            setStewardDid(
                                                                event.target.value,
                                                            )
                                                        }
                                                    />
                                                </label>
                                                <Button type='submit'>
                                                    Assign stewardship
                                                </Button>
                                            </form>
                                        </div>
                                    :   null}

                                    <div className='mt-5 space-y-2'>
                                        <h3 className='font-bold'>
                                            Stewarded resources
                                        </h3>
                                        {stewardships.length ?
                                            stewardships.map(item => {
                                                const mayReconfirm =
                                                    canAdmin ||
                                                    (selected.membership.role ===
                                                        'steward' &&
                                                        item.stewardDid === did);
                                                return (
                                                    <Card
                                                        key={item.id}
                                                        title={item.resourceUri}
                                                    >
                                                        <p className='text-xs'>
                                                            {item.status} · due{' '}
                                                            {new Date(
                                                                item.reconfirmDueAt,
                                                            ).toLocaleDateString()}
                                                        </p>
                                                        {mayReconfirm ?
                                                            <p className='mt-2'>
                                                                <Button
                                                                    type='button'
                                                                    variant='neutral'
                                                                    onClick={() =>
                                                                        void reconfirm(
                                                                            item,
                                                                        )
                                                                    }
                                                                >
                                                                    Reconfirm resource
                                                                </Button>
                                                            </p>
                                                        :   null}
                                                    </Card>
                                                );
                                            })
                                        :   <p className='text-sm text-mh-textMuted'>
                                                No resource stewardship is assigned.
                                            </p>}
                                    </div>
                                </>
                            :   null}
                        </Panel>
                    :   null}
                    {actionStatus ?
                        <p
                            role={
                                actionStatus.startsWith('Error:') ?
                                    'alert'
                                :   'status'
                            }
                            className='text-sm'
                        >
                            {actionStatus}
                        </p>
                    :   null}
                </>
            :   <Panel title='Sign in to participate'>
                    <p>
                        Sign in with an AT identity to create an organization,
                        accept an invitation, or manage stewardship.
                    </p>
                </Panel>}
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

const outcomeOptions = [
    'successful',
    'partially-successful',
    'unsuccessful',
    'no-response',
    'cancelled',
] as const;

const applicationServerKey = (value: string): ArrayBuffer => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
    const decoded = window.atob(base64);
    const buffer = new ArrayBuffer(decoded.length);
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < decoded.length; index += 1) {
        bytes[index] = decoded.charCodeAt(index);
    }
    return buffer;
};

const NotificationCenterRoute = () => {
    const [notifications, setNotifications] =
        useState<DurableNotification[]>([]);
    const [filter, setFilter] = useState<NotificationFilter>('all');
    const [total, setTotal] = useState(0);
    const [unread, setUnread] = useState(0);
    const [nextCursor, setNextCursor] = useState<string>();
    const [channels, setChannels] =
        useState<NotificationChannelState>();
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('Loading notifications…');
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(async () => {
        setIsLoading(true);
        const [items, channelState] = await Promise.all([
            fetchNotificationsViaApi({ filter }),
            fetchNotificationChannelsViaApi(),
        ]);
        if (!items.ok || !channelState.ok) {
            setStatus(
                `Error: ${
                    !items.ok ? items.error
                    : !channelState.ok ? channelState.error
                    : 'Notifications are unavailable.'
                }`,
            );
            setIsLoading(false);
            return;
        }
        setNotifications(items.data.items);
        setTotal(items.data.total);
        setUnread(items.data.unread);
        setNextCursor(items.data.nextCursor);
        setChannels(channelState.data);
        setEmail(channelState.data.email?.address ?? '');
        setStatus(
            `${items.data.unread} unread notification${
                items.data.unread === 1 ? '' : 's'
            }.`,
        );
        setIsLoading(false);
    }, [filter]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const token = new URLSearchParams(window.location.search).get(
            'emailToken',
        );
        if (!token) return;
        void confirmNotificationEmailViaApi(token).then(result => {
            setStatus(
                result.ok ?
                    'Notification email confirmed.'
                :   `Error: ${result.error}`,
            );
            window.history.replaceState({}, '', '/notifications');
            if (result.ok) void load();
        });
    }, [load]);

    const updateChannelPreference = async (
        channel: 'inApp' | 'email' | 'push',
        enabled: boolean,
    ) => {
        const current = await fetchAccountPreferencesViaApi();
        if (!current.ok) {
            setStatus(`Error: ${current.error}`);
            return false;
        }
        const updated = await updateAccountPreferencesViaApi({
            ...current.data,
            notifications: {
                ...current.data.notifications,
                [channel]: enabled,
            },
        });
        if (!updated.ok) {
            setStatus(`Error: ${updated.error}`);
            return false;
        }
        return true;
    };

    const markRead = async (
        notification: DurableNotification,
        read: boolean,
    ) => {
        const result = await markNotificationReadViaApi(
            notification.id,
            read,
        );
        if (result.ok) await load();
        setStatus(
            result.ok ?
                read ? 'Notification marked read.'
                :   'Notification marked unread.'
            :   `Error: ${result.error}`,
        );
    };

    const markAllRead = async () => {
        const result = await markAllNotificationsReadViaApi();
        if (result.ok) await load();
        setStatus(
            result.ok ?
                `${result.data.updated} notification(s) marked read.`
            :   `Error: ${result.error}`,
        );
    };

    const archive = async (notification: DurableNotification) => {
        const result = await archiveNotificationViaApi(notification.id);
        if (result.ok) await load();
        setStatus(
            result.ok ?
                'Notification archived.'
            :   `Error: ${result.error}`,
        );
    };

    const verifyEmail = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const result =
            await requestNotificationEmailVerificationViaApi(email);
        const preferenceEnabled =
            result.ok ?
                await updateChannelPreference('email', true)
            :   false;
        setStatus(
            result.ok && preferenceEnabled ?
                'Confirmation email sent. The link expires in 30 minutes.'
            : !result.ok ?
                `Error: ${result.error}`
            :   'Error: Email delivery preference could not be enabled.',
        );
    };

    const disableEmail = async () => {
        const result = await disableNotificationEmailViaApi();
        if (result.ok) {
            await updateChannelPreference('email', false);
            await load();
        }
        setStatus(
            result.ok ?
                'Email notifications disabled.'
            :   `Error: ${result.error}`,
        );
    };

    const enablePush = async () => {
        try {
            if (
                !channels?.push.supported ||
                !channels.push.publicKey ||
                !('serviceWorker' in navigator) ||
                !('PushManager' in window)
            ) {
                setStatus('Error: Browser push is unavailable here.');
                return;
            }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setStatus('Browser push permission was not granted.');
                return;
            }
            if (!await updateChannelPreference('push', true)) return;
            await navigator.serviceWorker.register(
                '/push-service-worker.js',
                { scope: '/' },
            );
            const registration = await navigator.serviceWorker.ready;
            const existing =
                await registration.pushManager.getSubscription();
            const subscription =
                existing ??
                await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey(
                        channels.push.publicKey,
                    ),
                });
            const serialized = subscription.toJSON();
            if (
                !serialized.endpoint ||
                !serialized.keys?.p256dh ||
                !serialized.keys.auth
            ) {
                throw new Error('The browser returned an incomplete subscription.');
            }
            const result = await registerPushSubscriptionViaApi({
                endpoint: serialized.endpoint,
                keys: {
                    p256dh: serialized.keys.p256dh,
                    auth: serialized.keys.auth,
                },
            });
            if (!result.ok) throw new Error(result.error);
            await load();
            setStatus('Browser push enabled by explicit opt-in.');
        } catch (error) {
            await updateChannelPreference('push', false);
            setStatus(
                `Error: ${
                    error instanceof Error ?
                        error.message
                    :   'Browser push could not be enabled.'
                }`,
            );
        }
    };

    const disablePush = async () => {
        try {
            const registration =
                'serviceWorker' in navigator ?
                    await navigator.serviceWorker.getRegistration('/')
                :   undefined;
            const subscription =
                await registration?.pushManager.getSubscription();
            const result = await revokePushSubscriptionViaApi(
                subscription?.endpoint,
            );
            if (!result.ok) throw new Error(result.error);
            await subscription?.unsubscribe();
            await updateChannelPreference('push', false);
            await load();
            setStatus('Browser push revoked.');
        } catch (error) {
            setStatus(
                `Error: ${
                    error instanceof Error ?
                        error.message
                    :   'Browser push could not be revoked.'
                }`,
            );
        }
    };

    const loadMore = async () => {
        if (!nextCursor) return;
        const result = await fetchNotificationsViaApi({
            filter,
            cursor: nextCursor,
        });
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        setNotifications(current => [...current, ...result.data.items]);
        setNextCursor(result.data.nextCursor);
    };

    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>Notification center</h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Durable in-app updates with optional verified email and
                    explicit browser-push delivery.
                </p>
            </header>
            <Panel title='Delivery preferences'>
                <p className='text-sm'>
                    In-app updates are always retained for your account.
                    External channels never contain exact locations, private
                    evidence, contact details, or moderation notes.
                </p>
                <div className='mt-4 grid gap-4 md:grid-cols-2'>
                    <form className='space-y-2' onSubmit={verifyEmail}>
                        <label
                            htmlFor='notification-email'
                            className='block text-sm font-bold'
                        >
                            Verified notification email
                        </label>
                        <Input
                            id='notification-email'
                            type='email'
                            value={email}
                            onChange={event => setEmail(event.target.value)}
                            required
                        />
                        <p className='text-xs text-mh-textMuted'>
                            {channels?.email?.verified ?
                                'Verified and eligible for delivery.'
                            :   'Not verified. Email remains disabled until confirmation.'}
                        </p>
                        <div className='flex flex-wrap gap-2'>
                            <Button type='submit'>Send confirmation</Button>
                            {channels?.email ?
                                <Button
                                    type='button'
                                    variant='neutral'
                                    onClick={() => void disableEmail()}
                                >
                                    Disable email
                                </Button>
                            :   null}
                        </div>
                    </form>
                    <div className='space-y-2'>
                        <h3 className='text-sm font-bold'>Browser push</h3>
                        <p className='text-xs text-mh-textMuted'>
                            {channels?.push.activeSubscriptions ?? 0} active
                            browser subscription(s). Permission is requested
                            only when you choose Enable.
                        </p>
                        <div className='flex flex-wrap gap-2'>
                            <Button
                                type='button'
                                onClick={() => void enablePush()}
                                disabled={!channels?.push.supported}
                            >
                                Enable browser push
                            </Button>
                            <Button
                                type='button'
                                variant='neutral'
                                onClick={() => void disablePush()}
                            >
                                Revoke browser push
                            </Button>
                        </div>
                    </div>
                </div>
            </Panel>
            <Panel title='Updates'>
                <div className='mb-4 flex flex-wrap items-end gap-3'>
                    <label className='text-sm font-bold'>
                        Show
                        <select
                            className='mh-input ml-2 px-3 py-2'
                            aria-label='Notification filter'
                            value={filter}
                            onChange={event =>
                                setFilter(
                                    event.target.value as NotificationFilter,
                                )
                            }
                        >
                            <option value='all'>Active</option>
                            <option value='unread'>Unread</option>
                            <option value='read'>Read</option>
                            <option value='archived'>Archived</option>
                        </select>
                    </label>
                    <Badge tone={unread ? 'info' : 'neutral'}>
                        {unread} unread · {total} active
                    </Badge>
                    <Button
                        type='button'
                        variant='neutral'
                        onClick={() => void markAllRead()}
                        disabled={unread === 0}
                    >
                        Mark all read
                    </Button>
                    <Button
                        type='button'
                        variant='neutral'
                        onClick={() => void load()}
                    >
                        Refresh
                    </Button>
                </div>
                {isLoading ?
                    <p role='status'>Loading durable notifications…</p>
                : notifications.length === 0 ?
                    <p>No notifications match this filter.</p>
                :   <div className='space-y-3'>
                        {notifications.map(notification => (
                            <Card
                                key={notification.id}
                                title={notification.title}
                            >
                                <p>{notification.body}</p>
                                <p className='mt-2 text-xs text-mh-textMuted'>
                                    {notification.type.replaceAll('_', ' ')} ·{' '}
                                    {notification.priority} ·{' '}
                                    {new Date(
                                        notification.createdAt,
                                    ).toLocaleString()}
                                </p>
                                <div className='mt-3 flex flex-wrap gap-2'>
                                    <Button
                                        type='button'
                                        variant='neutral'
                                        onClick={() =>
                                            void markRead(
                                                notification,
                                                !notification.read,
                                            )
                                        }
                                    >
                                        {notification.read ?
                                            'Mark unread'
                                        :   'Mark read'}
                                    </Button>
                                    {!notification.archived ?
                                        <Button
                                            type='button'
                                            variant='neutral'
                                            onClick={() =>
                                                void archive(notification)
                                            }
                                        >
                                            Archive
                                        </Button>
                                    :   null}
                                    {notification.actionUrl ?
                                        <a
                                            className='font-bold underline'
                                            href={notification.actionUrl}
                                        >
                                            Open related activity
                                        </a>
                                    :   null}
                                </div>
                            </Card>
                        ))}
                    </div>}
                {nextCursor ?
                    <p className='mt-4'>
                        <Button
                            type='button'
                            variant='neutral'
                            onClick={() => void loadMore()}
                        >
                            Load more
                        </Button>
                    </p>
                :   null}
            </Panel>
            <p
                role={status.startsWith('Error:') ? 'alert' : 'status'}
                className='text-sm'
            >
                {status}
            </p>
        </section>
    );
};

const CoordinationInboxRoute = ({ did }: { did: string }) => {
    const [offers, setOffers] = useState<CoordinationOffer[]>([]);
    const [connections, setConnections] = useState<
        CoordinationConnection[]
    >([]);
    const [items, setItems] = useState<ActivityInboxItem[]>([]);
    const [feedback, setFeedback] = useState<OutcomeFeedback[]>([]);
    const [requests, setRequests] = useState<FeedRecordEnvelope[]>([]);
    const [matches, setMatches] = useState<
        Readonly<Record<string, MatchCandidate[]>>
    >({});
    const [notes, setNotes] = useState<Readonly<Record<string, string>>>({});
    const [languages, setLanguages] = useState('en');
    const [accessibility, setAccessibility] = useState('');
    const [outcomes, setOutcomes] = useState<
        Readonly<
            Record<
                string,
                {
                    outcome: (typeof outcomeOptions)[number];
                    rating: number;
                    comment: string;
                    safetyConcern: boolean;
                }
            >
        >
    >({});
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [status, setStatus] = useState('Loading coordination activity…');

    const load = useCallback(async () => {
        setStatus('Loading coordination activity…');
        const [coordination, inbox, outcomeHistory, discoverable] =
            await Promise.all([
                fetchCoordinationViaApi(),
                fetchActivityInboxViaApi(unreadOnly),
                fetchMyOutcomeFeedbackViaApi(),
                fetchFeedRecordsFromApi(defaultDiscoveryFilterState, 'feed'),
            ]);
        const failure = [
            coordination,
            inbox,
            outcomeHistory,
            discoverable,
        ].find(result => !result.ok);
        if (failure && !failure.ok) {
            setStatus(`Error: ${failure.error}`);
            return;
        }
        if (
            coordination.ok &&
            inbox.ok &&
            outcomeHistory.ok &&
            discoverable.ok
        ) {
            setOffers(coordination.data.offers);
            setConnections(coordination.data.connections);
            setItems(inbox.data.items);
            setFeedback(outcomeHistory.data.feedback);
            setRequests(discoverable.data);
            setStatus(
                `${inbox.data.unread} unread item${inbox.data.unread === 1 ? '' : 's'}.`,
            );
        }
    }, [unreadOnly]);

    useEffect(() => {
        void load();
    }, [load]);

    const finish = async (
        pendingMessage: string,
        operation: Promise<{ ok: boolean; error?: string }>,
    ) => {
        setStatus(pendingMessage);
        const result = await operation;
        if (!result.ok) {
            setStatus(`Error: ${result.error ?? 'The action failed.'}`);
            return;
        }
        await load();
    };

    const ownedRequests = requests.filter(
        request => request.recipientDid === did,
    );
    const availableRequests = requests.filter(
        request => request.recipientDid !== did,
    );

    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>Coordination inbox</h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Review durable offers, assignments, safety updates, and
                    outcomes. This is activity coordination, not chat; it has no
                    messages or conversation history.
                </p>
                <p
                    className='mt-2 text-sm font-bold'
                    role={status.startsWith('Error:') ? 'alert' : 'status'}
                >
                    {status}
                </p>
            </header>

            <Panel title='Discover requests and offer help'>
                {availableRequests.length === 0 ?
                    <p className='text-sm text-mh-textMuted'>
                        No open requests from other accounts are discoverable.
                    </p>
                :   <div className='grid gap-3 sm:grid-cols-2'>
                        {availableRequests.map(request => (
                            <Card
                                key={request.aidPostUri}
                                title={request.card.title}
                            >
                                <p className='text-sm'>
                                    {request.card.description}
                                </p>
                                <p className='mt-2 text-xs text-mh-textMuted'>
                                    {formatCategoryLabel(
                                        request.card.category,
                                    )}{' '}
                                    · {request.card.status}
                                </p>
                                <label className='mt-3 block text-sm font-bold'>
                                    Optional coordination note
                                    <textarea
                                        className='mh-input mt-1 min-h-20 w-full px-3 py-2'
                                        maxLength={1000}
                                        value={notes[request.aidPostUri] ?? ''}
                                        onChange={event =>
                                            setNotes(current => ({
                                                ...current,
                                                [request.aidPostUri]:
                                                    event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <Button
                                    className='mt-3'
                                    onClick={() =>
                                        void finish(
                                            'Sending offer…',
                                            createCoordinationOfferViaApi({
                                                requestUri:
                                                    request.aidPostUri,
                                                note:
                                                    notes[
                                                        request.aidPostUri
                                                    ]?.trim() || null,
                                            }),
                                        )
                                    }
                                >
                                    Offer help
                                </Button>
                            </Card>
                        ))}
                    </div>}
            </Panel>

            <Panel title='Offers'>
                {offers.length === 0 ?
                    <p className='text-sm text-mh-textMuted'>
                        No offers yet.
                    </p>
                :   <div className='space-y-3'>
                        {offers.map(offer => (
                            <Card
                                key={offer.id}
                                title={`${formatCategoryLabel(offer.direction)} offer`}
                            >
                                <div className='flex flex-wrap gap-2'>
                                    <Badge
                                        tone={
                                            offer.status === 'accepted' ?
                                                'success'
                                            : offer.status === 'pending' ?
                                                'info'
                                            :   'neutral'
                                        }
                                    >
                                        {formatCategoryLabel(offer.status)}
                                    </Badge>
                                    <span className='text-xs text-mh-textMuted'>
                                        Expires{' '}
                                        {new Date(
                                            offer.expiresAt,
                                        ).toLocaleString()}
                                    </span>
                                </div>
                                {offer.note ?
                                    <p className='mt-2 text-sm'>{offer.note}</p>
                                :   null}
                                {offer.status === 'accepted' ?
                                    <p className='mt-2 break-all text-xs'>
                                        Requester: {offer.requesterDid}
                                        <br />
                                        Helper: {offer.helperDid}
                                    </p>
                                :   <p className='mt-2 text-xs text-mh-textMuted'>
                                        Participant identity remains private
                                        until acceptance.
                                    </p>}
                                {offer.status === 'pending' ?
                                    <div className='mt-3 flex flex-wrap gap-2'>
                                        {offer.direction === 'received' ?
                                            <>
                                                <Button
                                                    onClick={() =>
                                                        void finish(
                                                            'Accepting offer…',
                                                            decideCoordinationOfferViaApi(
                                                                {
                                                                    offerId:
                                                                        offer.id,
                                                                    decision:
                                                                        'accept',
                                                                },
                                                            ),
                                                        )
                                                    }
                                                >
                                                    Accept
                                                </Button>
                                                <Button
                                                    variant='secondary'
                                                    onClick={() =>
                                                        void finish(
                                                            'Declining offer…',
                                                            decideCoordinationOfferViaApi(
                                                                {
                                                                    offerId:
                                                                        offer.id,
                                                                    decision:
                                                                        'decline',
                                                                },
                                                            ),
                                                        )
                                                    }
                                                >
                                                    Decline
                                                </Button>
                                            </>
                                        :   <Button
                                                variant='secondary'
                                                onClick={() =>
                                                    void finish(
                                                        'Cancelling offer…',
                                                        decideCoordinationOfferViaApi(
                                                            {
                                                                offerId:
                                                                    offer.id,
                                                                decision:
                                                                    'cancel',
                                                            },
                                                        ),
                                                    )
                                                }
                                            >
                                                Cancel offer
                                            </Button>}
                                    </div>
                                :   null}
                            </Card>
                        ))}
                    </div>}
            </Panel>

            <Panel title='Explainable matching'>
                <p className='mb-3 text-sm text-mh-textMuted'>
                    Suggestions use category, approximate distance,
                    availability, language, accessibility, and active
                    verification. Results are deterministic and advisory;
                    Patchwork never assigns anyone automatically or computes a
                    reputation score.
                </p>
                <div className='grid gap-3 sm:grid-cols-2'>
                    <label className='text-sm font-bold'>
                        Required languages
                        <Input
                            value={languages}
                            onChange={event =>
                                setLanguages(event.target.value)
                            }
                            placeholder='en, es'
                        />
                    </label>
                    <label className='text-sm font-bold'>
                        Accessibility needs
                        <Input
                            value={accessibility}
                            onChange={event =>
                                setAccessibility(event.target.value)
                            }
                            placeholder='wheelchair-accessible'
                        />
                    </label>
                </div>
                {ownedRequests.length === 0 ?
                    <p className='mt-3 text-sm text-mh-textMuted'>
                        Publish an open request to review eligible candidates.
                    </p>
                :   ownedRequests.map(request => (
                        <div
                            key={request.aidPostUri}
                            className='mt-4 border-t border-mh-borderSoft pt-4'
                        >
                            <div className='flex flex-wrap items-center justify-between gap-2'>
                                <h2 className='font-bold'>
                                    {request.card.title}
                                </h2>
                                <Button
                                    onClick={() =>
                                        void (async () => {
                                            setStatus('Ranking candidates…');
                                            const result =
                                                await matchRequestViaApi({
                                                    requestUri:
                                                        request.aidPostUri,
                                                    requiredLanguages:
                                                        parseCommaList(
                                                            languages,
                                                        ),
                                                    accessibilityNeeds:
                                                        parseCommaList(
                                                            accessibility,
                                                        ),
                                                });
                                            if (!result.ok) {
                                                setStatus(
                                                    `Error: ${result.error}`,
                                                );
                                                return;
                                            }
                                            setMatches(current => ({
                                                ...current,
                                                [request.aidPostUri]:
                                                    result.data.candidates,
                                            }));
                                            setStatus(
                                                `${result.data.candidates.length} eligible candidate${result.data.candidates.length === 1 ? '' : 's'} ranked.`,
                                            );
                                        })()
                                    }
                                >
                                    Find candidates
                                </Button>
                            </div>
                            <ol className='mt-3 space-y-2'>
                                {(matches[request.aidPostUri] ?? []).map(
                                    candidate => (
                                        <li
                                            key={candidate.candidateRef}
                                            className='rounded border border-mh-borderSoft p-3'
                                        >
                                            <p className='font-bold'>
                                                #{candidate.rank}{' '}
                                                {candidate.label}
                                            </p>
                                            <p className='text-xs text-mh-textMuted'>
                                                {candidate.kind} ·{' '}
                                                {candidate.availability} ·
                                                verification{' '}
                                                {candidate.verification}
                                            </p>
                                            <ul className='mt-2 list-disc pl-5 text-sm'>
                                                {candidate.explanations.map(
                                                    explanation => (
                                                        <li key={explanation}>
                                                            {explanation}
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                            <p className='mt-2 text-xs font-bold'>
                                                Manual selection only
                                            </p>
                                        </li>
                                    ),
                                )}
                            </ol>
                        </div>
                    ))}
            </Panel>

            <Panel title='Connections and outcomes'>
                {connections.length === 0 ?
                    <p className='text-sm text-mh-textMuted'>
                        Accepted offers will appear here.
                    </p>
                :   <div className='space-y-3'>
                        {connections.map(connection => {
                            const alreadySubmitted = feedback.some(
                                entry =>
                                    entry.connectionId === connection.id,
                            );
                            const draft = outcomes[connection.id] ?? {
                                outcome: 'successful',
                                rating: 5,
                                comment: '',
                                safetyConcern: false,
                            };
                            return (
                                <Card
                                    key={connection.id}
                                    title={`Connection · ${formatCategoryLabel(connection.status)}`}
                                >
                                    <p className='break-all text-xs'>
                                        Connected with{' '}
                                        {connection.counterpartDid}
                                    </p>
                                    {connection.status === 'active' ?
                                        <>
                                            <ExactLocationExchange
                                                connectionId={connection.id}
                                            />
                                            <div className='mt-3 flex flex-wrap gap-2'>
                                                <Button
                                                    onClick={() =>
                                                        void finish(
                                                            'Completing handoff…',
                                                            transitionCoordinationConnectionViaApi(
                                                                {
                                                                    connectionId:
                                                                        connection.id,
                                                                    action: 'complete',
                                                                },
                                                            ),
                                                        )
                                                    }
                                                >
                                                    Complete handoff
                                                </Button>
                                                <Button
                                                    variant='secondary'
                                                    onClick={() =>
                                                        void finish(
                                                            'Cancelling connection…',
                                                            transitionCoordinationConnectionViaApi(
                                                                {
                                                                    connectionId:
                                                                        connection.id,
                                                                    action: 'cancel',
                                                                },
                                                            ),
                                                        )
                                                    }
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </>
                                    : connection.status === 'completed' &&
                                      !alreadySubmitted ?
                                        <form
                                            className='mt-3 space-y-3 border-t border-mh-borderSoft pt-3'
                                            onSubmit={event => {
                                                event.preventDefault();
                                                void finish(
                                                    'Saving outcome…',
                                                    submitOutcomeFeedbackViaApi(
                                                        {
                                                            connectionId:
                                                                connection.id,
                                                            outcome:
                                                                draft.outcome,
                                                            rating:
                                                                draft.rating,
                                                            comment:
                                                                draft.comment.trim() ||
                                                                null,
                                                            tags:
                                                                draft.safetyConcern ?
                                                                    [
                                                                        'safety-concern',
                                                                    ]
                                                                :   [],
                                                        },
                                                    ),
                                                );
                                            }}
                                        >
                                            <h3 className='font-bold'>
                                                Record structured outcome
                                            </h3>
                                            <div className='grid gap-3 sm:grid-cols-2'>
                                                <label className='text-sm font-bold'>
                                                    Outcome
                                                    <select
                                                        className='mh-input mt-1 w-full px-3 py-2'
                                                        value={draft.outcome}
                                                        onChange={event =>
                                                            setOutcomes(
                                                                current => ({
                                                                    ...current,
                                                                    [connection.id]:
                                                                        {
                                                                            ...draft,
                                                                            outcome:
                                                                                event
                                                                                    .target
                                                                                    .value as (typeof outcomeOptions)[number],
                                                                        },
                                                                }),
                                                            )
                                                        }
                                                    >
                                                        {outcomeOptions.map(
                                                            value => (
                                                                <option
                                                                    key={value}
                                                                    value={
                                                                        value
                                                                    }
                                                                >
                                                                    {formatCategoryLabel(
                                                                        value,
                                                                    )}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </label>
                                                <label className='text-sm font-bold'>
                                                    Rating
                                                    <Input
                                                        type='number'
                                                        min={1}
                                                        max={5}
                                                        value={draft.rating}
                                                        onChange={event =>
                                                            setOutcomes(
                                                                current => ({
                                                                    ...current,
                                                                    [connection.id]:
                                                                        {
                                                                            ...draft,
                                                                            rating:
                                                                                Number(
                                                                                    event
                                                                                        .target
                                                                                        .value,
                                                                                ),
                                                                        },
                                                                }),
                                                            )
                                                        }
                                                    />
                                                </label>
                                            </div>
                                            <label className='block text-sm font-bold'>
                                                Optional comment
                                                <textarea
                                                    className='mh-input mt-1 min-h-20 w-full px-3 py-2'
                                                    maxLength={2000}
                                                    value={draft.comment}
                                                    onChange={event =>
                                                        setOutcomes(
                                                            current => ({
                                                                ...current,
                                                                [connection.id]:
                                                                    {
                                                                        ...draft,
                                                                        comment:
                                                                            event
                                                                                .target
                                                                                .value,
                                                                    },
                                                            }),
                                                        )
                                                    }
                                                />
                                            </label>
                                            <label className='block text-sm'>
                                                <input
                                                    type='checkbox'
                                                    checked={
                                                        draft.safetyConcern
                                                    }
                                                    onChange={event =>
                                                        setOutcomes(
                                                            current => ({
                                                                ...current,
                                                                [connection.id]:
                                                                    {
                                                                        ...draft,
                                                                        safetyConcern:
                                                                            event
                                                                                .target
                                                                                .checked,
                                                                    },
                                                            }),
                                                        )
                                                    }
                                                />{' '}
                                                Flag as a safety concern for
                                                structured review
                                            </label>
                                            <Button type='submit'>
                                                Submit outcome
                                            </Button>
                                        </form>
                                    : alreadySubmitted ?
                                        <p className='mt-3 text-sm text-mh-textMuted'>
                                            Your outcome feedback is recorded.
                                        </p>
                                    :   null}
                                </Card>
                            );
                        })}
                    </div>}
            </Panel>

            <Panel title='Activity'>
                <label className='mb-3 block text-sm'>
                    <input
                        type='checkbox'
                        checked={unreadOnly}
                        onChange={event =>
                            setUnreadOnly(event.target.checked)
                        }
                    />{' '}
                    Show unread only
                </label>
                {items.length === 0 ?
                    <p className='text-sm text-mh-textMuted'>
                        No activity items.
                    </p>
                :   <div className='space-y-2'>
                        {items.map(item => (
                            <Card key={item.id} title={item.title}>
                                <p className='text-sm'>{item.summary}</p>
                                <p className='mt-1 text-xs text-mh-textMuted'>
                                    {formatCategoryLabel(item.type)} ·{' '}
                                    {new Date(
                                        item.occurredAt,
                                    ).toLocaleString()}
                                </p>
                                {!item.readAt ?
                                    <Button
                                        className='mt-3'
                                        variant='neutral'
                                        onClick={() =>
                                            void finish(
                                                'Marking item read…',
                                                markActivityInboxReadViaApi(
                                                    item.id,
                                                ),
                                            )
                                        }
                                    >
                                        Mark read
                                    </Button>
                                :   null}
                            </Card>
                        ))}
                    </div>}
            </Panel>
        </section>
    );
};

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
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>
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

interface AccountPrivacyRouteProps {
    onDeactivated: () => Promise<void>;
}

const AccountPrivacyRoute = ({
    onDeactivated,
}: AccountPrivacyRouteProps) => {
    const [accountActionResult, setAccountActionResult] = useState<string>();
    const [confirmDeactivation, setConfirmDeactivation] = useState(false);
    const [pendingAction, setPendingAction] = useState<
        'export' | 'deactivate'
    >();
    const [preferences, setPreferences] = useState<AccountPreferences>(
        defaultAccountPreferences,
    );
    const [preferencesStatus, setPreferencesStatus] = useState<string>();

    useEffect(() => {
        const controller = new AbortController();
        void fetchAccountPreferencesViaApi(controller.signal).then(result => {
            if (!controller.signal.aborted && result.ok) {
                setPreferences(result.data);
            }
        });
        return () => controller.abort();
    }, []);

    const savePreferences = async () => {
        setPreferencesStatus('Saving preferences…');
        const result = await updateAccountPreferencesViaApi(preferences);
        if (!result.ok) {
            setPreferencesStatus(`Error: ${result.error}`);
            return;
        }
        setPreferences(result.data);
        setPreferencesStatus('Preferences saved.');
    };

    const handleExport = async () => {
        setPendingAction('export');
        setAccountActionResult(undefined);
        const result = await exportDataViaApi();
        setPendingAction(undefined);

        if (!result.ok) {
            setAccountActionResult(`Error: ${result.error}`);
            return;
        }

        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'patchwork-account-export.json';
        anchor.click();
        URL.revokeObjectURL(url);
        setAccountActionResult('Your Patchwork data export is ready.');
    };

    const handleDeactivate = async () => {
        setPendingAction('deactivate');
        setAccountActionResult(undefined);
        const result = await deactivateAccountViaApi();
        setPendingAction(undefined);

        if (!result.ok) {
            setAccountActionResult(`Error: ${result.error}`);
            return;
        }

        setConfirmDeactivation(false);
        await onDeactivated();
    };

    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>Account privacy</h1>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Export the data Patchwork holds or deactivate this
                    authenticated Patchwork account.
                </p>
            </header>

            <Panel title='Account controls'>
                <div className='space-y-4'>
                    <Card title='Privacy and delivery preferences'>
                        <div className='grid gap-3 sm:grid-cols-2'>
                            <label className='text-sm font-bold'>
                                Privacy
                                <select
                                    className='mh-input mt-1 w-full px-3 py-2'
                                    value={preferences.privacy}
                                    onChange={event =>
                                        setPreferences(current => ({
                                            ...current,
                                            privacy: event.target
                                                .value as AccountPreferences['privacy'],
                                        }))
                                    }
                                >
                                    <option value='public'>Public</option>
                                    <option value='community'>Community</option>
                                    <option value='private'>Private</option>
                                </select>
                            </label>
                            <label className='text-sm font-bold'>
                                Profile visibility
                                <select
                                    className='mh-input mt-1 w-full px-3 py-2'
                                    value={preferences.visibility}
                                    onChange={event =>
                                        setPreferences(current => ({
                                            ...current,
                                            visibility: event.target
                                                .value as AccountPreferences['visibility'],
                                        }))
                                    }
                                >
                                    <option value='public'>Public</option>
                                    <option value='authenticated'>
                                        Signed-in people
                                    </option>
                                    <option value='hidden'>Hidden</option>
                                </select>
                            </label>
                            <label className='text-sm font-bold'>
                                Language
                                <select
                                    className='mh-input mt-1 w-full px-3 py-2'
                                    value={preferences.language}
                                    onChange={event =>
                                        setPreferences(current => ({
                                            ...current,
                                            language: event.target
                                                .value as AccountPreferences['language'],
                                        }))
                                    }
                                >
                                    <option value='en'>English</option>
                                    <option value='es'>Español</option>
                                </select>
                            </label>
                            <label className='text-sm font-bold'>
                                Location visibility
                                <select
                                    className='mh-input mt-1 w-full px-3 py-2'
                                    value={preferences.location.sharing}
                                    onChange={event =>
                                        setPreferences(current => ({
                                            ...current,
                                            location: {
                                                ...current.location,
                                                sharing: event.target
                                                    .value as AccountPreferences['location']['sharing'],
                                            },
                                        }))
                                    }
                                >
                                    <option value='approximate'>
                                        Approximate only
                                    </option>
                                    <option value='hidden'>Hidden</option>
                                </select>
                            </label>
                        </div>
                        <div className='mt-3 grid gap-2 sm:grid-cols-2'>
                            {(
                                [
                                    ['inApp', 'In-app notifications'],
                                    ['email', 'Email notifications'],
                                    ['push', 'Browser push notifications'],
                                ] as const
                            ).map(([channel, label]) => (
                                <label
                                    key={channel}
                                    className='inline-flex items-center gap-2 text-sm'
                                >
                                    <input
                                        type='checkbox'
                                        checked={
                                            preferences.notifications[channel]
                                        }
                                        onChange={event =>
                                            setPreferences(current => ({
                                                ...current,
                                                notifications: {
                                                    ...current.notifications,
                                                    [channel]:
                                                        event.target.checked,
                                                },
                                            }))
                                        }
                                    />
                                    {label}
                                </label>
                            ))}
                            <label className='inline-flex items-center gap-2 text-sm'>
                                <input
                                    type='checkbox'
                                    checked={
                                        preferences.location
                                            .noPermanentAddress
                                    }
                                    onChange={event =>
                                        setPreferences(current => ({
                                            ...current,
                                            location: {
                                                ...current.location,
                                                noPermanentAddress:
                                                    event.target.checked,
                                            },
                                        }))
                                    }
                                />
                                I do not have a permanent address
                            </label>
                        </div>
                        <div className='mt-3 flex items-center gap-3'>
                            <Button
                                className='px-3 py-1 text-xs'
                                onClick={() => void savePreferences()}
                            >
                                Save preferences
                            </Button>
                            {preferencesStatus ?
                                <span
                                    role={
                                        preferencesStatus.startsWith('Error:') ?
                                            'alert'
                                        :   'status'
                                    }
                                    className='text-xs'
                                >
                                    {preferencesStatus}
                                </span>
                            :   null}
                        </div>
                    </Card>
                    <Card title='Data export'>
                        <p className='text-sm text-mh-textMuted'>
                            Download a versioned snapshot of Patchwork-held
                            account data. Credentials, third-party casework,
                            and a complete copy of your independent AT
                            repository are excluded.
                        </p>
                        <div className='mt-3'>
                            <Button
                                variant='secondary'
                                className='px-3 py-1 text-xs'
                                disabled={pendingAction !== undefined}
                                onClick={() => void handleExport()}
                            >
                                {pendingAction === 'export' ?
                                    'Preparing export…'
                                :   'Download data export'}
                            </Button>
                        </div>
                    </Card>

                    <Card title='Account deactivation'>
                        <p className='text-sm text-mh-textMuted'>
                            Deactivation revokes Patchwork sessions and removes
                            your records from Patchwork discovery. It does not
                            delete records held independently by your AT
                            Protocol repository.
                        </p>
                        <div className='mt-3'>
                            <Button
                                variant='neutral'
                                className='px-3 py-1 text-xs'
                                disabled={pendingAction !== undefined}
                                onClick={() => setConfirmDeactivation(true)}
                            >
                                Deactivate account
                            </Button>
                        </div>
                        {confirmDeactivation ?
                            <div
                                role='alertdialog'
                                aria-label='Confirm account deactivation'
                                className='mh-alert mt-3'
                            >
                                <p className='text-sm font-bold'>
                                    Deactivate this Patchwork account?
                                </p>
                                <p className='mt-1 text-xs'>
                                    You will be signed out immediately.
                                    Reactivation requires a controlled support
                                    review.
                                </p>
                                <div className='mt-2 flex flex-wrap gap-2'>
                                    <Button
                                        type='button'
                                        disabled={pendingAction !== undefined}
                                        onClick={() => void handleDeactivate()}
                                    >
                                        {pendingAction === 'deactivate' ?
                                            'Deactivating…'
                                        :   'Confirm deactivation'}
                                    </Button>
                                    <Button
                                        type='button'
                                        variant='neutral'
                                        disabled={pendingAction !== undefined}
                                        onClick={() =>
                                            setConfirmDeactivation(false)
                                        }
                                    >
                                        Keep account active
                                    </Button>
                                </div>
                            </div>
                        :   null}
                    </Card>

                    {accountActionResult ?
                        <p
                            role={
                                accountActionResult.startsWith('Error:') ?
                                    'alert'
                                :   'status'
                            }
                            className='rounded-none border-2 border-mh-border bg-mh-surfaceElev px-3 py-2 text-xs font-bold'
                        >
                            {accountActionResult}
                        </p>
                    :   null}
                </div>
            </Panel>
        </section>
    );
};

interface PolicyConsentGateProps {
    onAccepted: () => void;
}

const policyLabels: Readonly<Record<string, string>> = {
    'terms-of-use': 'Terms of Use',
    'privacy-notice': 'Privacy Notice',
    'community-guidelines': 'Community Guidelines',
    'synthetic-data-disclosure': 'Synthetic-data disclosure',
    'location-sharing-consent': 'Location-sharing consent',
};

const PolicyConsentGate = ({ onAccepted }: PolicyConsentGateProps) => {
    const [accepted, setAccepted] = useState<Set<string>>(new Set());
    const [eligible, setEligible] = useState(false);
    const [status, setStatus] = useState<string>();
    const allAccepted = requiredPolicyDocuments.every(document =>
        accepted.has(document),
    );

    const submit = async () => {
        setStatus('Recording consent…');
        const result = await acceptCurrentPoliciesViaApi();
        if (!result.ok) {
            setStatus(`Error: ${result.error}`);
            return;
        }
        setStatus('Consent recorded.');
        onAccepted();
    };

    return (
        <Panel title='Review current policies'>
            <p className='text-sm text-mh-textMuted'>
                Version {CURRENT_POLICY_VERSION}. Material changes require a
                new acceptance before protected actions are available.
            </p>
            <div className='mt-4 space-y-2'>
                {requiredPolicyDocuments.map(document => (
                    <label
                        key={document}
                        className='flex items-start gap-2 text-sm'
                    >
                        <input
                            type='checkbox'
                            checked={accepted.has(document)}
                            onChange={event =>
                                setAccepted(current => {
                                    const next = new Set(current);
                                    if (event.target.checked) next.add(document);
                                    else next.delete(document);
                                    return next;
                                })
                            }
                        />
                        I accept the {policyLabels[document]}.
                    </label>
                ))}
                <label className='flex items-start gap-2 text-sm font-bold'>
                    <input
                        type='checkbox'
                        checked={eligible}
                        onChange={event => setEligible(event.target.checked)}
                    />
                    I confirm that I am at least 18 years old.
                </label>
            </div>
            <div className='mt-4 flex items-center gap-3'>
                <Button
                    disabled={!allAccepted || !eligible}
                    onClick={() => void submit()}
                >
                    Accept and continue
                </Button>
                {status ?
                    <span
                        role={status.startsWith('Error:') ? 'alert' : 'status'}
                        className='text-xs'
                    >
                        {status}
                    </span>
                :   null}
            </div>
        </Panel>
    );
};

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
        readonly {
            field: string;
            oldValue: unknown;
            newValue: unknown;
            timestamp: string;
            actor: string;
        }[]
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
        const result = await deactivateAccountViaApi();

        if (result.ok) {
            setAccountActionResult(
                'Account deactivated. Patchwork sessions are revoked and public projections are removed.',
            );
        } else {
            setAccountActionResult(`Error: ${result.error}`);
        }
    };

    const handleExport = async () => {
        setAccountActionResult(undefined);
        const result = await exportDataViaApi();

        if (result.ok) {
            const blob = new Blob([JSON.stringify(result.data, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'patchwork-account-export.json';
            anchor.click();
            URL.revokeObjectURL(url);
            setAccountActionResult('Your Patchwork data export is ready.');
        } else {
            setAccountActionResult(`Error: ${result.error}`);
        }
    };

    return (
        <section className='space-y-6'>
            <header className='mh-route-header'>
                <h1 className='mh-route-title'>
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
                                            (
                                                settings.geoSharingPrecision ===
                                                precision
                                            ) ?
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
                                Download the data Patchwork currently holds
                                about your authenticated account. Credentials,
                                third-party casework, and a complete AT
                                repository archive are excluded.
                            </p>
                            <div className='mt-3'>
                                <Button
                                    variant='secondary'
                                    className='px-3 py-1 text-xs'
                                    onClick={handleExport}
                                >
                                    Download data export
                                </Button>
                            </div>
                        </Card>

                        <Card title='Account deactivation'>
                            <p className='text-sm text-mh-textMuted'>
                                Deactivation immediately revokes Patchwork
                                sessions and removes your posts from Patchwork
                                discovery. Records in your independent AT
                                Protocol repository are not deleted.
                                Reactivation requires a controlled support
                                review.
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
                    <Button onClick={handleSave} disabled={!dirty || isSaving}>
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

const maintenanceReasonOptions: readonly {
    code: MaintenanceReasonCode;
    label: string;
}[] = [
    { code: 'privacy', label: 'Privacy boundary failure' },
    { code: 'authorization', label: 'Authorization failure' },
    { code: 'abuse', label: 'Active abuse incident' },
    { code: 'integrity', label: 'Data integrity uncertainty' },
    { code: 'moderation-backlog', label: 'Unsafe moderation backlog' },
    { code: 'monitoring', label: 'Monitoring coverage failure' },
    { code: 'backup', label: 'Backup or restore failure' },
];

const ModeratorConsoleRoute = ({
    onMaintenanceChanged,
}: {
    onMaintenanceChanged(state: MaintenanceState): void;
}) => {
    const [items, setItems] = useState<ModerationQueueItem[]>([]);
    const [audit, setAudit] = useState<ModerationAuditRecord[]>([]);
    const [maintenance, setMaintenance] = useState<MaintenanceState>();
    const [selectedUri, setSelectedUri] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [appealFilter, setAppealFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [reason, setReason] = useState('Moderator safety review');
    const [maintenanceReasons, setMaintenanceReasons] = useState<
        MaintenanceReasonCode[]
    >(['integrity']);
    const [publicMessage, setPublicMessage] = useState(
        'New submissions are temporarily paused while safety checks run.',
    );
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string>();
    const [accessDenied, setAccessDenied] = useState(false);
    const [notice, setNotice] = useState<string>();

    const load = useCallback(async (signal?: AbortSignal) => {
        setIsLoading(true);
        setError(undefined);
        const [queueResult, maintenanceResult] = await Promise.all([
            fetchModerationQueueViaApi(signal),
            fetchModeratorMaintenanceViaApi(signal),
        ]);
        if (signal?.aborted) return;
        const denied =
            (!queueResult.ok &&
                (queueResult.code === 'AUTHORIZATION_DENIED' ||
                    queueResult.code === 'AUTHENTICATION_REQUIRED')) ||
            (!maintenanceResult.ok &&
                (maintenanceResult.code === 'AUTHORIZATION_DENIED' ||
                    maintenanceResult.code === 'AUTHENTICATION_REQUIRED'));
        if (denied) {
            setAccessDenied(true);
            setIsLoading(false);
            return;
        }
        if (!queueResult.ok || !maintenanceResult.ok) {
            setError(
                !queueResult.ok ? queueResult.error
                : !maintenanceResult.ok ? maintenanceResult.error
                : 'Moderator console is unavailable.',
            );
            setIsLoading(false);
            return;
        }
        setAccessDenied(false);
        setItems(queueResult.data);
        setMaintenance(maintenanceResult.data);
        onMaintenanceChanged(maintenanceResult.data);
        setSelectedUri(current =>
            queueResult.data.some(item => item.subjectUri === current) ?
                current
            :   queueResult.data[0]?.subjectUri ?? '',
        );
        setIsLoading(false);
    }, [onMaintenanceChanged]);

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const selected = items.find(item => item.subjectUri === selectedUri);
    const filteredItems = items.filter(item =>
        (!statusFilter || item.queueStatus === statusFilter) &&
        (!priorityFilter || (item.priority ?? 'normal') === priorityFilter) &&
        (!appealFilter || item.appealState === appealFilter) &&
        (!typeFilter || item.subjectType === typeFilter),
    );

    const loadAudit = async (subjectUri: string) => {
        setSelectedUri(subjectUri);
        const result = await fetchModerationAuditViaApi(subjectUri);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setAudit(result.data);
    };

    const applyAction = async (action: ModerationPolicyAction) => {
        if (!selected || reason.trim().length < 1) return;
        setIsSaving(true);
        setError(undefined);
        const result = await applyModerationPolicyViaApi({
            subjectUri: selected.subjectUri,
            action,
            reason: reason.trim(),
        });
        setIsSaving(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setItems(current =>
            current.map(item =>
                item.subjectUri === result.data.subjectUri ? result.data : item,
            ),
        );
        setNotice(`Action recorded: ${action}.`);
        await loadAudit(result.data.subjectUri);
    };

    const declareMaintenance = async () => {
        if (maintenanceReasons.length === 0) {
            setError('Select at least one declared shutdown reason.');
            return;
        }
        setIsSaving(true);
        const result = await declareMaintenanceViaApi({
            reasonCodes: maintenanceReasons,
            publicMessage,
        });
        setIsSaving(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setMaintenance(result.data);
        onMaintenanceChanged(result.data);
        setNotice('New submissions and exact-location exchange are shut down.');
    };

    const resume = async () => {
        setIsSaving(true);
        const result = await resumeMaintenanceViaApi();
        setIsSaving(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setMaintenance(result.data);
        onMaintenanceChanged(result.data);
        setNotice('Audited moderator resume completed.');
    };

    if (accessDenied) {
        return (
            <Panel title='Moderator access required'>
                <p role='alert'>
                    This console requires the durable content-moderation capability.
                </p>
            </Panel>
        );
    }

    return (
        <div className='space-y-5'>
            <Panel title='Moderator safety console'>
                <p className='text-sm text-mh-textMuted'>
                    Review only evidence-safe previews. Exact addresses, private
                    attachments, contact details, and raw sensitive submissions
                    are intentionally excluded from this queue.
                </p>
                <p className='mt-2 text-sm font-bold'>
                    We aim to review reports within two business days, but this is
                    a best-effort target and not a guaranteed service level.
                </p>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Urgent safety flags notify configured moderator channels.
                    Patchwork remains operationally NO-GO for emergency response,
                    guaranteed fulfillment, or handling emergency dispatch.
                </p>
                <div className='mt-3 flex flex-wrap gap-3 text-sm'>
                    <a className='font-bold underline' href='/verification'>
                        Verification and appeal controls
                    </a>
                    <a className='font-bold underline' href='/verification'>
                        Exact-address and private-attachment controls
                    </a>
                </div>
            </Panel>

            {error ?
                <p role='alert' className='border-2 border-mh-danger p-3 font-bold'>
                    {error}
                </p>
            : null}
            {notice ?
                <p role='status' className='border-2 border-mh-border p-3 font-bold'>
                    {notice}
                </p>
            : null}

            <Panel title='New-submission shutdown'>
                <p className='text-sm text-mh-textMuted'>
                    An active declaration blocks all new submissions and exact
                    location exchange while public reads and status stay available.
                    Resume is capability-gated and written to the audit log.
                </p>
                <p className='mt-2 font-bold'>
                    Current state: {maintenance?.active ? 'READ-ONLY' : 'Operating'}
                    {maintenance?.environmentOverride ? ' (environment override)' : ''}
                </p>
                <div className='mt-3 grid gap-2 sm:grid-cols-2'>
                    {maintenanceReasonOptions.map(option => (
                        <label key={option.code} className='flex items-center gap-2 text-sm'>
                            <input
                                type='checkbox'
                                checked={maintenanceReasons.includes(option.code)}
                                onChange={event =>
                                    setMaintenanceReasons(current =>
                                        event.target.checked ?
                                            [...current, option.code]
                                        :   current.filter(code => code !== option.code),
                                    )
                                }
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
                <label className='mt-3 block text-sm font-bold'>
                    Public status message
                    <Input
                        value={publicMessage}
                        maxLength={300}
                        onChange={event => setPublicMessage(event.target.value)}
                    />
                </label>
                <div className='mt-3 flex flex-wrap gap-2'>
                    <Button
                        variant='neutral'
                        disabled={isSaving || maintenance?.active}
                        onClick={() => void declareMaintenance()}
                    >
                        Shut down new submissions
                    </Button>
                    <Button
                        variant='secondary'
                        disabled={
                            isSaving ||
                            !maintenance?.active ||
                            maintenance.environmentOverride
                        }
                        onClick={() => void resume()}
                    >
                        Resume after verification
                    </Button>
                </div>
            </Panel>

            <Panel title='Safety review queue'>
                <div className='grid gap-2 sm:grid-cols-4'>
                    <select
                        aria-label='Filter by status'
                        value={statusFilter}
                        onChange={event => setStatusFilter(event.target.value)}
                    >
                        <option value=''>All statuses</option>
                        <option value='queued'>Queued</option>
                        <option value='processing'>Processing</option>
                        <option value='resolved'>Resolved</option>
                    </select>
                    <select
                        aria-label='Filter by priority'
                        value={priorityFilter}
                        onChange={event => setPriorityFilter(event.target.value)}
                    >
                        <option value=''>All priorities</option>
                        <option value='urgent'>Urgent</option>
                        <option value='high'>High</option>
                        <option value='normal'>Normal</option>
                        <option value='low'>Low</option>
                    </select>
                    <select
                        aria-label='Filter by appeal'
                        value={appealFilter}
                        onChange={event => setAppealFilter(event.target.value)}
                    >
                        <option value=''>All appeal states</option>
                        <option value='none'>No appeal</option>
                        <option value='pending'>Pending</option>
                        <option value='under-review'>Under review</option>
                        <option value='upheld'>Upheld</option>
                        <option value='rejected'>Rejected</option>
                    </select>
                    <select
                        aria-label='Filter by content type'
                        value={typeFilter}
                        onChange={event => setTypeFilter(event.target.value)}
                    >
                        <option value=''>All content types</option>
                        <option value='aid-post'>Aid post</option>
                        <option value='directory-resource'>Directory resource</option>
                        <option value='other'>Other</option>
                    </select>
                </div>
                {isLoading ?
                    <p className='mt-4' role='status'>Loading moderator state…</p>
                : filteredItems.length === 0 ?
                    <p className='mt-4'>No queue items match these filters.</p>
                :   <div className='mt-4 grid gap-3 lg:grid-cols-2'>
                        {filteredItems.map(item => (
                            <button
                                type='button'
                                key={item.subjectUri}
                                onClick={() => void loadAudit(item.subjectUri)}
                                className='border-2 border-mh-border p-3 text-left'
                                aria-pressed={selectedUri === item.subjectUri}
                            >
                                <span className='font-bold'>
                                    {item.safePreview?.['label'] ?? 'Submitted content'}
                                </span>
                                <span className='mt-1 block text-xs uppercase'>
                                    {item.priority ?? 'normal'} · {item.subjectType} ·
                                    {' '}{item.queueStatus} ·{' '}
                                    {item.recordOrigin ?? 'visitor-created'}
                                </span>
                                <span className='mt-2 block text-sm'>
                                    {(item.reasonCodes ?? [item.latestReason]).join(', ')}
                                </span>
                                <span className='mt-2 block break-all text-xs text-mh-textMuted'>
                                    {item.subjectUri}
                                </span>
                            </button>
                        ))}
                    </div>
                }
            </Panel>

            {selected ?
                <Panel title='Selected case actions'>
                    <dl className='grid gap-2 text-sm sm:grid-cols-2'>
                        {Object.entries(selected.safePreview ?? {}).map(([key, value]) => (
                            <div key={key}>
                                <dt className='font-bold'>{key}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <label className='mt-3 block text-sm font-bold'>
                        Required audit reason
                        <Input
                            value={reason}
                            onChange={event => setReason(event.target.value)}
                        />
                    </label>
                    <div className='mt-3 flex flex-wrap gap-2'>
                        {selected.visibility !== 'suspended' ?
                            <Button
                                variant='neutral'
                                disabled={isSaving}
                                onClick={() => void applyAction('suspend-visibility')}
                            >
                                Quarantine now
                            </Button>
                        : null}
                        {selected.visibility !== 'delisted' ?
                            <Button
                                variant='neutral'
                                disabled={isSaving}
                                onClick={() => void applyAction('delist')}
                            >
                                Delist
                            </Button>
                        : null}
                        {selected.visibility !== 'visible' ?
                            <Button
                                variant='secondary'
                                disabled={isSaving}
                                onClick={() => void applyAction('restore-visibility')}
                            >
                                Restore visibility
                            </Button>
                        : null}
                        {selected.appealState === 'none' ?
                            <Button
                                variant='secondary'
                                disabled={isSaving}
                                onClick={() => void applyAction('open-appeal')}
                            >
                                Open appeal
                            </Button>
                        : selected.appealState === 'pending' ?
                            <Button
                                variant='secondary'
                                disabled={isSaving}
                                onClick={() => void applyAction('start-appeal-review')}
                            >
                                Start appeal review
                            </Button>
                        : selected.appealState === 'under-review' ?
                            <>
                                <Button
                                    variant='secondary'
                                    disabled={isSaving}
                                    onClick={() => void applyAction('resolve-appeal-upheld')}
                                >
                                    Uphold appeal
                                </Button>
                                <Button
                                    variant='neutral'
                                    disabled={isSaving}
                                    onClick={() => void applyAction('resolve-appeal-rejected')}
                                >
                                    Reject appeal
                                </Button>
                            </>
                        : null}
                    </div>
                    <h3 className='mt-5 font-bold'>Durable audit trail</h3>
                    {audit.length === 0 ?
                        <p className='text-sm text-mh-textMuted'>
                            Select this case to load its audit trail.
                        </p>
                    :   <ol className='mt-2 space-y-2'>
                            {audit.map(entry => (
                                <li key={entry.actionId} className='border-l-4 border-mh-border pl-3 text-sm'>
                                    <strong>{entry.action}</strong> by {entry.actorDid}
                                    <span className='block'>{entry.reason}</span>
                                    <time dateTime={entry.occurredAt}>
                                        {new Date(entry.occurredAt).toLocaleString()}
                                    </time>
                                </li>
                            ))}
                        </ol>
                    }
                </Panel>
            : null}
        </div>
    );
};

export const FrontendShell = ({ appTitle }: FrontendShellProps) => {
    const auth = useAuth();
    const mainContentRef = useRef<HTMLDivElement>(null);
    const [currentRoute, setCurrentRoute] = useState<AppRoute>(() =>
        readCurrentRoute(),
    );

    const [discoveryState, setDiscoveryState] = useState<DiscoveryFilterState>(
        () => readDiscoveryStateFromUrl(defaultShellDiscoveryState),
    );

    const [feedRecords, setFeedRecords] = useState<FeedRecordEnvelope[]>([]);
    const [resourceCards, setResourceCards] = useState<ResourceDirectoryCard[]>(
        [],
    );
    const [isAidLoading, setIsAidLoading] = useState(false);
    const [isDirectoryLoading, setIsDirectoryLoading] = useState(false);
    const [aidErrorMessage, setAidErrorMessage] = useState<string>();
    const [publicSyncFailure, setPublicSyncFailure] =
        useState<PublicSyncFailure>();
    const [publicSyncRetrying, setPublicSyncRetrying] = useState(false);
    const [directoryErrorMessage, setDirectoryErrorMessage] =
        useState<string>();
    const [aidDataOrigin, setAidDataOrigin] = useState<ApiDataOrigin>(
        webDataMode === 'fixture' ? 'fixture' : 'unavailable',
    );
    const [directoryDataOrigin, setDirectoryDataOrigin] =
        useState<ApiDataOrigin>(
            webDataMode === 'fixture' ? 'fixture' : 'unavailable',
        );
    const [aidReload, setAidReload] = useState(0);
    const [directoryReload, setDirectoryReload] = useState(0);
    const [selectedMapPostId, setSelectedMapPostId] = useState<string>();
    const [chatIntent, setChatIntent] = useState<ChatInitiationIntent>();
    const [chatState, setChatState] = useState<ChatLaunchState>(
        defaultChatLaunchState,
    );
    const [hasChatPermission, setHasChatPermission] = useState(true);
    const [forceChatFallback, setForceChatFallback] = useState(false);
    const [chatRequestPreview, setChatRequestPreview] = useState<string>();
    const [consentRequired, setConsentRequired] = useState<
        boolean | undefined
    >(webDataMode === 'fixture' ? false : undefined);
    const [onboardingError, setOnboardingError] = useState<string>();
    const [maintenanceStatus, setMaintenanceStatus] =
        useState<MaintenanceState>();
    const [isOnline, setIsOnline] = useState(
        typeof navigator === 'undefined' ? true : navigator.onLine,
    );

    const currentUserDid = auth.session?.did ?? '';

    useEffect(() => {
        if (webDataMode === 'fixture') return;
        const controller = new AbortController();
        void fetchPublicMaintenanceStatusViaApi(controller.signal).then(result => {
            if (!controller.signal.aborted && result.ok) {
                setMaintenanceStatus(result.data);
            }
        });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const online = () => setIsOnline(true);
        const offline = () => setIsOnline(false);
        window.addEventListener('online', online);
        window.addEventListener('offline', offline);
        return () => {
            window.removeEventListener('online', online);
            window.removeEventListener('offline', offline);
        };
    }, []);

    useEffect(() => {
        if (webDataMode === 'fixture' || !auth.session) {
            setConsentRequired(false);
            setOnboardingError(undefined);
            return;
        }
        const controller = new AbortController();
        setConsentRequired(undefined);
        setOnboardingError(undefined);
        void fetchAccountOnboardingViaApi(controller.signal).then(result => {
            if (controller.signal.aborted) return;
            if (!result.ok) {
                setOnboardingError(result.error);
                return;
            }
            setConsentRequired(result.data.consentRequired);
        });
        return () => controller.abort();
    }, [auth.session]);

    useEffect(() => {
        if (import.meta.env.VITE_DATA_MODE !== 'fixture') {
            return;
        }

        let active = true;
        void import('./fixtures').then(
            ({ fixtureFeedRecords, fixtureResourceCards }) => {
                if (!active) return;
                setFeedRecords([...fixtureFeedRecords]);
                setResourceCards([...fixtureResourceCards]);
            },
        );

        return () => {
            active = false;
        };
    }, []);

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
        if (webDataMode === 'fixture') return undefined;

        const controller = new AbortController();
        setIsAidLoading(true);
        setAidErrorMessage(undefined);

        void fetchFeedRecordsFromApi(
            discoveryState,
            currentRoute === '/map' ? 'map' : 'feed',
            controller.signal,
        )
            .then(async result => {
                if (controller.signal.aborted) {
                    return;
                }

                if (result.ok) {
                    const records = await Promise.all(
                        result.data.map(async record => {
                            if (
                                !currentUserDid ||
                                record.recipientDid !== currentUserDid
                            ) {
                                return record;
                            }
                            const lifecycle = await queryAidPostLifecycleViaApi(
                                record.aidPostUri,
                                controller.signal,
                            );
                            const lifecycleStatus =
                                lifecycle.ok ?
                                    lifecycleStatusFromValue(
                                        lifecycle.data.currentStatus,
                                    )
                                : lifecycle.code === 'NOT_FOUND' ?
                                    lifecycleStatusFromValue(record.card.status)
                                :   undefined;
                            const validTransitions =
                                lifecycle.ok ?
                                    lifecycle.data.validTransitions.flatMap(
                                        value => {
                                            const status =
                                                lifecycleStatusFromValue(value);
                                            return status ? [status] : [];
                                        },
                                    )
                                : lifecycle.code === 'NOT_FOUND' ?
                                    ([
                                        'open',
                                        'resolved',
                                    ] satisfies LifecycleStatus[])
                                :   undefined;
                            return lifecycleStatus ?
                                    {
                                        ...record,
                                        card: {
                                            ...record.card,
                                            lifecycleStatus,
                                            ...(validTransitions ?
                                                { validTransitions }
                                            :   {}),
                                            ...(lifecycle.ok ?
                                                {
                                                    timeline:
                                                        lifecycle.data.timeline.flatMap(
                                                            entry => {
                                                                const from =
                                                                    lifecycleStatusFromValue(
                                                                        entry.from,
                                                                    );
                                                                const to =
                                                                    lifecycleStatusFromValue(
                                                                        entry.to,
                                                                    );
                                                                return (
                                                                        from &&
                                                                            to
                                                                    ) ?
                                                                        [
                                                                            {
                                                                                ...entry,
                                                                                from,
                                                                                to,
                                                                            } satisfies FeedStatusTransition,
                                                                        ]
                                                                    :   [];
                                                            },
                                                        ),
                                                }
                                            :   {}),
                                        },
                                    }
                                :   record;
                        }),
                    );
                    if (controller.signal.aborted) return;
                    setFeedRecords(records);
                    setAidDataOrigin('api');
                    return;
                }

                setAidDataOrigin('unavailable');
                setAidErrorMessage(
                    `${result.kind} ${result.code}: ${result.error}`,
                );
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsAidLoading(false);
                }
            });

        return () => {
            controller.abort();
        };
    }, [aidReload, currentRoute, currentUserDid, discoveryState]);

    useEffect(() => {
        if (currentRoute !== '/resources') {
            return undefined;
        }
        if (webDataMode === 'fixture') return undefined;

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

                setDirectoryDataOrigin('unavailable');
                setDirectoryErrorMessage(
                    `${result.kind} ${result.code}: ${result.error}`,
                );
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsDirectoryLoading(false);
                }
            });

        return () => {
            controller.abort();
        };
    }, [currentRoute, directoryReload, discoveryState]);

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

    const retryPublicSync = () => {
        const failure = publicSyncFailure;
        if (!failure || !failure.expectedCid) return;
        setPublicSyncRetrying(true);
        void reconcileAidPostStatusViaApi({
            uri: failure.postUri,
            expectedCid: failure.expectedCid,
            updatedAt: failure.updatedAt,
        }).then(result => {
            setPublicSyncRetrying(false);
            if (!result.ok) {
                setPublicSyncFailure({
                    ...failure,
                    message: `${result.code}: ${result.error}`,
                });
                return;
            }
            setFeedRecords(current =>
                replaceRecordFromAtResult(current, result.data),
            );
            setPublicSyncFailure(undefined);
        });
    };

    const requiresAuthentication =
        currentRoute === '/posting' ||
        currentRoute === '/chat' ||
        currentRoute === '/inbox' ||
        currentRoute === '/notifications' ||
        currentRoute === '/moderation' ||
        currentRoute === '/settings';
    const isDeferredFixtureRoute =
        webDataMode !== 'fixture' && deferredFixtureRoutes.has(currentRoute);
    const visibleAccountRoutes =
        webDataMode === 'fixture' ? accountRoutes : productionAccountRoutes;
    const visibleSecondaryRoutes =
        webDataMode === 'fixture' ?
            secondaryRoutes
        :   [...secondaryRoutes, '/volunteer', '/chat'] as const;

    const content =
        isDeferredFixtureRoute ?
            currentRoute === '/chat' ?
                <Panel title='Chat is not available'>
                    <p>{CHAT_PLACEHOLDER_CONTRACT.message}</p>
                    <p className='mt-2 text-sm text-mh-textMuted'>
                        This placeholder has no history, initiation, or message
                        mutation runtime.
                    </p>
                </Panel>
            :   <Panel title='Deferred from the alpha'>
                    <p>
                        This prototype surface is available only in the explicit
                        local fixture demo and is not part of the production alpha.
                    </p>
                </Panel>
        : requiresAuthentication && !auth.session ?
            <Panel title='Sign in required'>
                <p>This action uses your authenticated AT Protocol identity.</p>
                <a
                    className='mt-3 inline-block font-bold underline'
                    href={`/login?returnTo=${encodeURIComponent(currentRoute)}`}
                >
                    Sign in to continue
                </a>
            </Panel>
        : auth.session &&
          webDataMode !== 'fixture' &&
          onboardingError ?
            <Panel title='Onboarding unavailable'>
                <p role='alert'>
                    Protected actions remain disabled because current policy
                    consent could not be checked: {onboardingError}
                </p>
            </Panel>
        : auth.session &&
          webDataMode !== 'fixture' &&
          consentRequired === undefined ?
            <Panel title='Checking account policies'>
                <p role='status'>Loading your current consent status…</p>
            </Panel>
        : auth.session &&
          webDataMode !== 'fixture' &&
          consentRequired ?
            <PolicyConsentGate
                onAccepted={() => {
                    setConsentRequired(false);
                    setOnboardingError(undefined);
                }}
            />
        : maintenanceStatus?.active && currentRoute === '/posting' ?
            <Panel title='New submissions are temporarily paused'>
                <p role='alert'>{maintenanceStatus.publicMessage}</p>
                <p className='mt-2 text-sm text-mh-textMuted'>
                    Existing public information remains readable. Exact-location
                    exchange and all other new-submission APIs are also disabled
                    until an audited moderator resume.
                </p>
            </Panel>
        : currentRoute === '/map' ?
            <MapRoute
                discoveryState={discoveryState}
                onPatchDiscovery={patchDiscoveryState}
                feedRecords={feedRecords}
                isLoading={isAidLoading}
                errorMessage={aidErrorMessage}
                dataOrigin={aidDataOrigin}
                onRetry={() => setAidReload(value => value + 1)}
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
                onRetry={() => setAidReload(value => value + 1)}
                publicSyncFailure={publicSyncFailure}
                publicSyncRetrying={publicSyncRetrying}
                onRetryPublicSync={retryPublicSync}
                onNavigate={navigate}
                onOpenChat={openChatFromRecord}
                onUpdateCard={(id, patch) => {
                    applyLifecycleAction({
                        action: 'edit',
                        id,
                        patch,
                    });
                }}
                onReplaceRecord={replacement =>
                    setFeedRecords(current =>
                        current.map(record =>
                            record.aidPostUri === replacement.aidPostUri ?
                                replacement
                            :   record,
                        ),
                    )
                }
                onDeleteRecord={aidPostUri =>
                    setFeedRecords(current =>
                        current.filter(
                            record => record.aidPostUri !== aidPostUri,
                        ),
                    )
                }
                onTransition={(id, postUri, targetStatus) => {
                    const record = feedRecords.find(
                        candidate => candidate.aidPostUri === postUri,
                    );
                    const updatedAt = nowIso();
                    setPublicSyncFailure(undefined);
                    void transitionAidPostViaApi({
                        postUri,
                        targetStatus,
                        now: updatedAt,
                    }).then(result => {
                        if (result.ok) {
                            applyLifecycleAction({
                                action: 'transition',
                                id,
                                targetStatus,
                                actorDid: result.data.transition.actorDid,
                                actorRole: result.data.transition.actorRole,
                            });
                            if (!record?.cid) {
                                setAidErrorMessage(
                                    'Private workflow saved, but the indexed record revision is unavailable. Retry discovery before synchronizing public status.',
                                );
                                return;
                            }
                            void reconcileAidPostStatusViaApi({
                                uri: postUri,
                                expectedCid: record.cid,
                                updatedAt,
                            }).then(syncResult => {
                                if (!syncResult.ok) {
                                    setPublicSyncFailure({
                                        postUri,
                                        expectedCid: record.cid!,
                                        updatedAt,
                                        message: `${syncResult.code}: ${syncResult.error}`,
                                    });
                                    return;
                                }
                                setFeedRecords(current =>
                                    replaceRecordFromAtResult(
                                        current,
                                        syncResult.data,
                                    ),
                                );
                                setPublicSyncFailure(undefined);
                            });
                        }
                    });
                }}
                currentUserDid={currentUserDid}
            />
        : currentRoute === '/posting' ?
            <PostingRoute
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
                onRetry={() => setDirectoryReload(value => value + 1)}
                resourceCards={resourceCards}
                currentUserDid={currentUserDid}
            />
        : currentRoute === '/volunteer' ?
            webDataMode === 'fixture' ?
                <LegacyFixtureVolunteerRoute did={currentUserDid} />
            :   <VolunteerRoute did={currentUserDid} />
        : currentRoute === '/organizations' ?
            <OrganizationsRoute did={currentUserDid} />
        : currentRoute === '/verification' ?
            <VerificationRoute did={currentUserDid} />
        : currentRoute === '/inbox' ?
            <CoordinationInboxRoute did={currentUserDid} />
        : currentRoute === '/notifications' ?
            <NotificationCenterRoute />
        : currentRoute === '/moderation' ?
            <ModeratorConsoleRoute
                onMaintenanceChanged={setMaintenanceStatus}
            />
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
            webDataMode === 'fixture' ?
                <SettingsRoute currentUserDid={currentUserDid} />
            :   <AccountPrivacyRoute onDeactivated={auth.restore} />
        : currentRoute === '/legal/terms' ||
          currentRoute === '/legal/privacy' ||
          currentRoute === '/legal/community-guidelines' ?
            <LegalPolicyRoute route={currentRoute} />
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
            <div className='mh-grid-pattern mx-auto min-h-screen max-w-7xl px-3 pb-16 sm:px-6 lg:px-10'>
                <header className='mh-masthead'>
                    <a
                        href='/'
                        className='mh-brand'
                        onClick={event => handleRouteClick(event, '/')}
                    >
                        <span className='mh-brand-mark' aria-hidden='true'>
                            P
                        </span>
                        <span>
                            <strong>{appTitle}</strong>
                            <small>Mutual aid, block by block</small>
                        </span>
                    </a>
                    <div className='mh-network-status' role='status'>
                        <span aria-hidden='true' /> Pre-alpha environment
                    </div>
                </header>

                <nav aria-label='Primary flows' className='mh-primary-nav'>
                    <div className='mh-nav-main'>
                        {primaryRoutes.map(route => (
                            <a
                                key={route}
                                href={route}
                                className='mh-nav-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mh-accent'
                                aria-current={
                                    currentRoute === route ? 'page' : undefined
                                }
                                onClick={event =>
                                    handleRouteClick(event, route)
                                }
                            >
                                {routeLabels[route]}
                            </a>
                        ))}
                    </div>
                    <div className='mh-nav-tools'>
                        {visibleAccountRoutes.map(route => (
                            <a
                                key={route}
                                href={route}
                                className='mh-nav-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mh-accent'
                                aria-current={
                                    currentRoute === route ? 'page' : undefined
                                }
                                onClick={event =>
                                    handleRouteClick(event, route)
                                }
                            >
                                {routeLabels[route]}
                            </a>
                        ))}
                        <details className='mh-more-menu'>
                            <summary className='mh-nav-chip'>
                                More <span aria-hidden='true'>+</span>
                            </summary>
                            <div className='mh-more-menu-panel'>
                                {visibleSecondaryRoutes.map(route => (
                                    <a
                                        key={route}
                                        href={route}
                                        aria-current={
                                            currentRoute === route ? 'page' : (
                                                undefined
                                            )
                                        }
                                        onClick={event =>
                                            handleRouteClick(event, route)
                                        }
                                    >
                                        {routeLabels[route]}
                                    </a>
                                ))}
                            </div>
                        </details>
                        <div className='mh-auth-control' aria-live='polite'>
                            {auth.status === 'booting' ?
                                <span>Checking session…</span>
                            : auth.session ?
                                <>
                                    <span className='max-w-48 truncate text-xs font-bold'>
                                        {auth.session.did}
                                    </span>
                                    <Button
                                        variant='neutral'
                                        className='px-3 py-1 text-xs'
                                        onClick={() => void auth.logout()}
                                    >
                                        Sign out
                                    </Button>
                                </>
                            :   <a
                                    className='mh-nav-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mh-accent'
                                    href={`/login?returnTo=${encodeURIComponent(currentRoute)}`}
                                >
                                    Sign in
                                </a>
                            }
                        </div>
                    </div>
                </nav>

                {maintenanceStatus?.active ?
                    <div
                        role='alert'
                        className='mb-4 border-4 border-mh-danger bg-mh-surfaceElev p-4'
                    >
                        <strong>Patchwork is temporarily read-only.</strong>{' '}
                        {maintenanceStatus.publicMessage} New submissions and
                        exact-location exchange are disabled; public reads and
                        service status remain available.
                    </div>
                : null}

                {!isOnline ?
                    <div
                        role='alert'
                        className='mb-4 border-4 border-mh-danger bg-mh-surfaceElev p-4'
                    >
                        <strong>You are offline.</strong> Previously rendered
                        public data may be stale. Patchwork does not queue
                        mutations offline; reconnect before posting, offering,
                        or changing account state.
                    </div>
                : null}

                <div
                    id='main-content'
                    ref={mainContentRef}
                    tabIndex={-1}
                    className='focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mh-accent'
                >
                    {content}
                </div>

                <footer className='mh-footer'>
                    <p>
                        <strong>Patchwork</strong> is community infrastructure,
                        not an emergency service.
                    </p>
                    <div role='navigation' aria-label='Legal'>
                        <a
                            href='/legal/terms'
                            onClick={event =>
                                handleRouteClick(event, '/legal/terms')
                            }
                        >
                            Terms
                        </a>
                        <a
                            href='/legal/privacy'
                            onClick={event =>
                                handleRouteClick(event, '/legal/privacy')
                            }
                        >
                            Privacy
                        </a>
                        <a
                            href='/legal/community-guidelines'
                            onClick={event =>
                                handleRouteClick(
                                    event,
                                    '/legal/community-guidelines',
                                )
                            }
                        >
                            Community guidelines
                        </a>
                    </div>
                </footer>
            </div>
        </main>
    );
};
