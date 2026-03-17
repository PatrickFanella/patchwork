import {
    aidCategories,
    aidStatuses,
    type AidCategory,
    type AidStatus,
    type DiscoveryFilterState,
} from '../discovery-filters';
import { createFeedCard } from '../feed-ux';
import type { NormalizedAidPostingDraft } from '../posting-form';
import type {
    DirectoryResourceCategory,
    ResourceDirectoryCard,
} from '../resource-directory-ux';
import { defaultDiscoveryCenter, type FeedRecordEnvelope } from './fixtures';
import type {
    SettingsChangeAudit,
    UserSettings,
} from '@patchwork/shared';

export type ApiDataOrigin = 'api' | 'fallback';

export interface ApiClientSuccess<TData> {
    ok: true;
    data: TData;
}

export interface ApiClientFailure {
    ok: false;
    error: string;
}

export type ApiClientResult<TData> = ApiClientSuccess<TData> | ApiClientFailure;

export interface ChatInitiationApiResult {
    conversationUri: string;
    created: boolean;
    transportPath: 'atproto-direct' | 'resource-fallback' | 'manual-fallback';
    fallbackNotice?: {
        code: 'RECIPIENT_CAPABILITY_MISSING';
        message: string;
        safeForUser: true;
        transportPath?:
            | 'atproto-direct'
            | 'resource-fallback'
            | 'manual-fallback';
    };
}

export interface AidPostCreateApiInput {
    authorDid: string;
    draft: NormalizedAidPostingDraft;
    rkey: string;
    now?: string;
    trustScore?: number;
}

const DEFAULT_API_BASE_URL = 'http://localhost:4000';
const REQUEST_TIMEOUT_MS = 6_000;
const DEFAULT_NEARBY_RADIUS_KM = 20;
const DEFAULT_FEED_RADIUS_KM = 100;

type AidQueryScope = 'map' | 'feed';

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const readString = (
    value: Record<string, unknown>,
    key: string,
): string | undefined => {
    const raw = value[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
};

const readNumber = (
    value: Record<string, unknown>,
    key: string,
): number | undefined => {
    const raw = value[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw;
    }

    if (typeof raw === 'string' && raw.trim().length > 0) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return undefined;
};

const toApiUrgency = (
    minUrgency: DiscoveryFilterState['minUrgency'],
): 'low' | 'medium' | 'high' | 'critical' | undefined => {
    if (!minUrgency) {
        return undefined;
    }

    if (minUrgency >= 5) {
        return 'critical';
    }
    if (minUrgency >= 4) {
        return 'high';
    }
    if (minUrgency >= 3) {
        return 'medium';
    }

    return 'low';
};

const toFreshnessHours = (since: string | undefined): number | undefined => {
    if (!since) {
        return undefined;
    }

    const parsed = Date.parse(since);
    if (Number.isNaN(parsed)) {
        return undefined;
    }

    const hours = Math.ceil(Math.max(0, Date.now() - parsed) / 3_600_000);
    return Math.max(1, hours);
};

const toRadiusKm = (radiusMeters: number): number => {
    const km = radiusMeters / 1000;
    return Math.min(250, Math.max(0.3, Number(km.toFixed(2))));
};

const buildAidQueryParams = (
    state: DiscoveryFilterState,
    scope: AidQueryScope,
): URLSearchParams => {
    const fallbackRadiusKm =
        scope === 'feed' && state.feedTab === 'latest' ?
            DEFAULT_FEED_RADIUS_KM
        :   DEFAULT_NEARBY_RADIUS_KM;

    const center = state.center ?? defaultDiscoveryCenter;
    const radiusKm =
        state.radiusMeters !== undefined ?
            toRadiusKm(state.radiusMeters)
        :   fallbackRadiusKm;

    const params = new URLSearchParams({
        latitude: center.lat.toFixed(6),
        longitude: center.lng.toFixed(6),
        radiusKm: String(radiusKm),
        page: '1',
        pageSize: '100',
    });

    if (state.category) {
        params.set('category', state.category);
    }

    if (state.status) {
        params.set('status', state.status);
    }

    const urgency = toApiUrgency(state.minUrgency);
    if (urgency) {
        params.set('urgency', urgency);
    }

    if (state.text) {
        params.set('searchText', state.text);
    }

    const freshnessHours = toFreshnessHours(state.since);
    if (freshnessHours) {
        params.set('freshnessHours', String(freshnessHours));
    }

    return params;
};

const buildDirectoryQueryParams = (
    state: DiscoveryFilterState,
): URLSearchParams => {
    const center = state.center ?? defaultDiscoveryCenter;
    const radiusKm =
        state.radiusMeters !== undefined ?
            toRadiusKm(state.radiusMeters)
        :   DEFAULT_NEARBY_RADIUS_KM;

    const params = new URLSearchParams({
        latitude: center.lat.toFixed(6),
        longitude: center.lng.toFixed(6),
        radiusKm: String(radiusKm),
        page: '1',
        pageSize: '100',
    });

    if (state.text) {
        params.set('searchText', state.text);
    }

    const freshnessHours = toFreshnessHours(state.since);
    if (freshnessHours) {
        params.set('freshnessHours', String(freshnessHours));
    }

    return params;
};

const readApiBaseUrl = (): string => {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === 'string' && configured.trim().length > 0) {
        return configured;
    }

    return DEFAULT_API_BASE_URL;
};

const resolveApiUrl = (path: string, params: URLSearchParams): string => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const baseUrl = readApiBaseUrl();

    let url: URL;
    if (/^https?:\/\//i.test(baseUrl)) {
        url = new URL(
            normalizedPath,
            baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
        );
    } else {
        const origin =
            typeof window !== 'undefined' ?
                window.location.origin
            :   DEFAULT_API_BASE_URL;
        const normalizedBase =
            baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
        url = new URL(
            `${normalizedBase.replace(/\/$/, '')}${normalizedPath}`,
            origin,
        );
    }

    url.search = params.toString();
    return url.toString();
};

const toErrorMessage = (payload: unknown, fallback: string): string => {
    if (!isRecord(payload)) {
        return fallback;
    }

    const errorPayload = payload['error'];
    if (!isRecord(errorPayload)) {
        return fallback;
    }

    return readString(errorPayload, 'message') ?? fallback;
};

const requestJson = async (
    path: string,
    params: URLSearchParams,
    signal?: AbortSignal,
): Promise<ApiClientResult<unknown>> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener('abort', () => controller.abort(), {
                once: true,
            });
        }
    }

    try {
        const response = await fetch(resolveApiUrl(path, params), {
            method: 'GET',
            headers: {
                accept: 'application/json',
            },
            signal: controller.signal,
        });

        const payload = await response.json().catch(() => undefined);

        if (!response.ok) {
            return {
                ok: false,
                error: toErrorMessage(
                    payload,
                    `API request failed (${response.status}).`,
                ),
            };
        }

        return {
            ok: true,
            data: payload,
        };
    } catch (error) {
        return {
            ok: false,
            error:
                error instanceof Error ?
                    error.message
                :   'Unable to reach API endpoint.',
        };
    } finally {
        clearTimeout(timeoutId);
    }
};

const requestJsonPost = async (
    path: string,
    body: unknown,
    signal?: AbortSignal,
): Promise<ApiClientResult<unknown>> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener('abort', () => controller.abort(), {
                once: true,
            });
        }
    }

    try {
        const response = await fetch(
            resolveApiUrl(path, new URLSearchParams()),
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            },
        );

        const payload = await response.json().catch(() => undefined);

        if (!response.ok) {
            return {
                ok: false,
                error: toErrorMessage(
                    payload,
                    `API request failed (${response.status}).`,
                ),
            };
        }

        return {
            ok: true,
            data: payload,
        };
    } catch (error) {
        return {
            ok: false,
            error:
                error instanceof Error ?
                    error.message
                :   'Unable to reach API endpoint.',
        };
    } finally {
        clearTimeout(timeoutId);
    }
};

const requestJsonPut = async (
    path: string,
    body: unknown,
    signal?: AbortSignal,
): Promise<ApiClientResult<unknown>> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener('abort', () => controller.abort(), {
                once: true,
            });
        }
    }

    try {
        const response = await fetch(
            resolveApiUrl(path, new URLSearchParams()),
            {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            },
        );

        const payload = await response.json().catch(() => undefined);

        if (!response.ok) {
            return {
                ok: false,
                error: toErrorMessage(
                    payload,
                    `API request failed (${response.status}).`,
                ),
            };
        }

        return {
            ok: true,
            data: payload,
        };
    } catch (error) {
        return {
            ok: false,
            error:
                error instanceof Error ?
                    error.message
                :   'Unable to reach API endpoint.',
        };
    } finally {
        clearTimeout(timeoutId);
    }
};

// ---------------------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------------------

export interface SettingsApiGetResponse {
    did: string;
    settings: UserSettings;
}

export interface SettingsApiUpdateResponse {
    did: string;
    settings: UserSettings;
    changesRecorded: number;
}

export interface SettingsApiAuditResponse {
    did: string;
    total: number;
    entries: SettingsChangeAudit[];
}

export interface AccountActionApiResponse {
    did: string;
    action: string;
    status: string;
    requestedAt: string;
    message: string;
}

export const fetchSettingsFromApi = async (
    did: string,
    signal?: AbortSignal,
): Promise<ApiClientResult<SettingsApiGetResponse>> => {
    const params = new URLSearchParams({ did });
    const result = await requestJson('/account/settings', params, signal);

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return { ok: false, error: 'Settings response was malformed.' };
    }

    return {
        ok: true,
        data: result.data as unknown as SettingsApiGetResponse,
    };
};

export const updateSettingsViaApi = async (
    did: string,
    settings: UserSettings,
    signal?: AbortSignal,
): Promise<ApiClientResult<SettingsApiUpdateResponse>> => {
    const result = await requestJsonPut(
        '/account/settings',
        { did, settings },
        signal,
    );

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return { ok: false, error: 'Settings update response was malformed.' };
    }

    return {
        ok: true,
        data: result.data as unknown as SettingsApiUpdateResponse,
    };
};

export const fetchSettingsAuditFromApi = async (
    did: string,
    signal?: AbortSignal,
): Promise<ApiClientResult<SettingsApiAuditResponse>> => {
    const result = await requestJsonPost(
        '/account/settings/audit',
        { did },
        signal,
    );

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return { ok: false, error: 'Audit trail response was malformed.' };
    }

    return {
        ok: true,
        data: result.data as unknown as SettingsApiAuditResponse,
    };
};

export const deactivateAccountViaApi = async (
    did: string,
    reason?: string,
    signal?: AbortSignal,
): Promise<ApiClientResult<AccountActionApiResponse>> => {
    const result = await requestJsonPost(
        '/account/deactivate',
        { did, reason },
        signal,
    );

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return { ok: false, error: 'Deactivation response was malformed.' };
    }

    return {
        ok: true,
        data: result.data as unknown as AccountActionApiResponse,
    };
};

export const exportDataViaApi = async (
    did: string,
    reason?: string,
    signal?: AbortSignal,
): Promise<ApiClientResult<AccountActionApiResponse>> => {
    const result = await requestJsonPost(
        '/account/export',
        { did, reason },
        signal,
    );

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return { ok: false, error: 'Export response was malformed.' };
    }

    return {
        ok: true,
        data: result.data as unknown as AccountActionApiResponse,
    };
};

const parseAidCategory = (value: string | undefined): AidCategory => {
    if (value && aidCategories.includes(value as AidCategory)) {
        return value as AidCategory;
    }

    return 'other';
};

const parseAidStatus = (value: string | undefined): AidStatus => {
    if (value && aidStatuses.includes(value as AidStatus)) {
        return value as AidStatus;
    }

    return 'open';
};

const parseUrgency = (value: string | undefined): 1 | 2 | 3 | 4 | 5 => {
    if (value === 'critical') {
        return 5;
    }
    if (value === 'high') {
        return 4;
    }
    if (value === 'medium') {
        return 3;
    }

    return 2;
};

const toLexiconUrgency = (
    urgency: 1 | 2 | 3 | 4 | 5,
): 'low' | 'medium' | 'high' | 'critical' => {
    if (urgency >= 5) {
        return 'critical';
    }
    if (urgency >= 4) {
        return 'high';
    }
    if (urgency >= 3) {
        return 'medium';
    }

    return 'low';
};

const parseRecordIdFromUri = (uri: string, fallback: string): string => {
    const segments = uri.split('/').filter(Boolean);
    const candidate = segments.at(-1);

    return candidate && candidate.length > 0 ? candidate : fallback;
};

const parseDirectoryCategory = (
    value: string | undefined,
): DirectoryResourceCategory => {
    if (
        value === 'food-bank' ||
        value === 'shelter' ||
        value === 'clinic' ||
        value === 'legal-aid' ||
        value === 'hotline' ||
        value === 'other'
    ) {
        return value;
    }

    return 'other';
};

const mapAidPayloadToRecords = (payload: unknown): FeedRecordEnvelope[] => {
    if (!isRecord(payload)) {
        return [];
    }

    const rows = payload['results'];
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map((row, index) => {
            if (!isRecord(row)) {
                return undefined;
            }

            const uri =
                readString(row, 'uri') ??
                `at://did:example:unknown/app.patchwork.aid.post/remote-${index}`;
            const authorDid =
                readString(row, 'authorDid') ?? 'did:example:unknown';

            const approximateGeo =
                isRecord(row['approximateGeo']) ?
                    row['approximateGeo']
                :   undefined;

            const lat =
                approximateGeo ?
                    (readNumber(approximateGeo, 'latitude') ??
                    readNumber(approximateGeo, 'lat'))
                :   undefined;
            const lng =
                approximateGeo ?
                    (readNumber(approximateGeo, 'longitude') ??
                    readNumber(approximateGeo, 'lng'))
                :   undefined;

            const createdAt =
                readString(row, 'createdAt') ??
                readString(row, 'updatedAt') ??
                new Date().toISOString();
            const updatedAt = readString(row, 'updatedAt') ?? createdAt;

            return {
                aidPostUri: uri,
                recipientDid: authorDid,
                card: createFeedCard({
                    id: parseRecordIdFromUri(uri, `remote-${index}`),
                    title: readString(row, 'title') ?? 'Untitled request',
                    description:
                        readString(row, 'summary') ?? 'No summary available.',
                    category: parseAidCategory(readString(row, 'category')),
                    status: parseAidStatus(readString(row, 'status')),
                    urgency: parseUrgency(readString(row, 'urgency')),
                    accessibilityTags: [],
                    createdAt,
                    updatedAt,
                    location:
                        lat !== undefined && lng !== undefined ?
                            {
                                lat,
                                lng,
                            }
                        :   undefined,
                }),
            } satisfies FeedRecordEnvelope;
        })
        .filter((value): value is FeedRecordEnvelope => Boolean(value));
};

const mapDirectoryPayloadToCards = (
    payload: unknown,
): ResourceDirectoryCard[] => {
    if (!isRecord(payload)) {
        return [];
    }

    const rows = payload['results'];
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows.reduce<ResourceDirectoryCard[]>((cards, row, index) => {
        if (!isRecord(row)) {
            return cards;
        }

        const uri =
            readString(row, 'uri') ??
            `at://did:example:resource/app.patchwork.directory.resource/remote-${index}`;
        const approximateGeo =
            isRecord(row['approximateGeo']) ? row['approximateGeo'] : undefined;

        const lat =
            approximateGeo ?
                (readNumber(approximateGeo, 'latitude') ??
                readNumber(approximateGeo, 'lat'))
            :   undefined;
        const lng =
            approximateGeo ?
                (readNumber(approximateGeo, 'longitude') ??
                readNumber(approximateGeo, 'lng'))
            :   undefined;
        const precisionKm =
            approximateGeo ?
                readNumber(approximateGeo, 'precisionKm')
            :   undefined;

        const contact = isRecord(row['contact']) ? row['contact'] : {};

        cards.push({
            uri,
            id: parseRecordIdFromUri(uri, `remote-${index}`),
            name: readString(row, 'name') ?? 'Unnamed resource',
            category: parseDirectoryCategory(readString(row, 'category')),
            location: {
                lat: lat ?? defaultDiscoveryCenter.lat,
                lng: lng ?? defaultDiscoveryCenter.lng,
                precisionMeters:
                    precisionKm !== undefined ?
                        Math.round(precisionKm * 1000)
                    :   300,
                areaLabel: readString(row, 'serviceArea'),
            },
            openHours: readString(row, 'openHours'),
            eligibilityNotes: readString(row, 'eligibilityNotes'),
            contact: {
                url: readString(contact, 'url'),
                phone: readString(contact, 'phone'),
            },
        });

        return cards;
    }, []);
};

export const fetchFeedRecordsFromApi = async (
    state: DiscoveryFilterState,
    scope: AidQueryScope,
    signal?: AbortSignal,
): Promise<ApiClientResult<FeedRecordEnvelope[]>> => {
    const result = await requestJson(
        scope === 'map' ? '/query/map' : '/query/feed',
        buildAidQueryParams(state, scope),
        signal,
    );

    if (!result.ok) {
        return result;
    }

    return {
        ok: true,
        data: mapAidPayloadToRecords(result.data),
    };
};

export const fetchDirectoryCardsFromApi = async (
    state: DiscoveryFilterState,
    signal?: AbortSignal,
): Promise<ApiClientResult<ResourceDirectoryCard[]>> => {
    const result = await requestJson(
        '/query/directory',
        buildDirectoryQueryParams(state),
        signal,
    );

    if (!result.ok) {
        return result;
    }

    return {
        ok: true,
        data: mapDirectoryPayloadToCards(result.data),
    };
};

export const initiateChatViaApi = async (
    input: {
        aidPostUri: string;
        initiatedByDid: string;
        recipientDid: string;
        initiatedFrom: 'map' | 'feed' | 'detail';
        allowInitiation: boolean;
        supportsAtprotoChat?: boolean;
        now?: string;
    },
    signal?: AbortSignal,
): Promise<ApiClientResult<ChatInitiationApiResult>> => {
    const params = new URLSearchParams({
        aidPostUri: input.aidPostUri,
        initiatedByDid: input.initiatedByDid,
        recipientDid: input.recipientDid,
        initiatedFrom: input.initiatedFrom,
        allowInitiation: String(input.allowInitiation),
    });

    if (input.supportsAtprotoChat !== undefined) {
        params.set('supportsAtprotoChat', String(input.supportsAtprotoChat));
    }

    if (input.now) {
        params.set('now', input.now);
    }

    const result = await requestJson('/chat/initiate', params, signal);
    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return {
            ok: false,
            error: 'Chat initiation response was malformed.',
        };
    }

    const conversationUri = readString(result.data, 'conversationUri');
    if (!conversationUri) {
        return {
            ok: false,
            error: 'Chat initiation did not return a conversation URI.',
        };
    }

    const fallbackNoticeRaw =
        isRecord(result.data['fallbackNotice']) ?
            result.data['fallbackNotice']
        :   undefined;

    return {
        ok: true,
        data: {
            conversationUri,
            created: result.data['created'] === true,
            transportPath:
                (
                    readString(result.data, 'transportPath') ===
                    'resource-fallback'
                ) ?
                    'resource-fallback'
                : (
                    readString(result.data, 'transportPath') ===
                    'manual-fallback'
                ) ?
                    'manual-fallback'
                :   'atproto-direct',
            fallbackNotice:
                fallbackNoticeRaw ?
                    {
                        code: 'RECIPIENT_CAPABILITY_MISSING',
                        message:
                            readString(fallbackNoticeRaw, 'message') ??
                            'Fallback transport path selected.',
                        safeForUser: true,
                        transportPath:
                            (
                                readString(
                                    fallbackNoticeRaw,
                                    'transportPath',
                                ) === 'resource-fallback'
                            ) ?
                                'resource-fallback'
                            : (
                                readString(
                                    fallbackNoticeRaw,
                                    'transportPath',
                                ) === 'manual-fallback'
                            ) ?
                                'manual-fallback'
                            : (
                                readString(
                                    fallbackNoticeRaw,
                                    'transportPath',
                                ) === 'atproto-direct'
                            ) ?
                                'atproto-direct'
                            :   undefined,
                    }
                :   undefined,
        },
    };
};

export interface LifecycleTransitionApiInput {
    postUri: string;
    targetStatus: string;
    actorDid: string;
    actorRole: string;
    reason?: string;
    now?: string;
}

export interface LifecycleTransitionApiResult {
    postUri: string;
    previousStatus: string;
    currentStatus: string;
    transition: {
        from: string;
        to: string;
        actorDid: string;
        actorRole: string;
        timestamp: string;
        reason?: string;
    };
    timeline: Array<{
        from: string;
        to: string;
        actorDid: string;
        actorRole: string;
        timestamp: string;
        reason?: string;
    }>;
    updatedAt: string;
}

export interface LifecycleQueryApiResult {
    postUri: string;
    currentStatus: string;
    statusLabel: string;
    timeline: Array<{
        from: string;
        to: string;
        actorDid: string;
        actorRole: string;
        timestamp: string;
        reason?: string;
    }>;
    validTransitions: string[];
    updatedAt: string;
}

export const transitionAidPostViaApi = async (
    input: LifecycleTransitionApiInput,
    signal?: AbortSignal,
): Promise<ApiClientResult<LifecycleTransitionApiResult>> => {
    const body = {
        postUri: input.postUri,
        targetStatus: input.targetStatus,
        actorDid: input.actorDid,
        actorRole: input.actorRole,
        reason: input.reason,
        now: input.now,
    };

    const result = await requestJsonPost(
        '/aid/post/transition',
        body,
        signal,
    );

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return {
            ok: false,
            error: 'Lifecycle transition response was malformed.',
        };
    }

    return {
        ok: true,
        data: result.data as unknown as LifecycleTransitionApiResult,
    };
};

export const queryAidPostLifecycleViaApi = async (
    postUri: string,
    actorRole?: string,
    signal?: AbortSignal,
): Promise<ApiClientResult<LifecycleQueryApiResult>> => {
    const params = new URLSearchParams({ postUri });
    if (actorRole) {
        params.set('actorRole', actorRole);
    }

    const result = await requestJson('/aid/post/lifecycle', params, signal);

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return {
            ok: false,
            error: 'Lifecycle query response was malformed.',
        };
    }

    return {
        ok: true,
        data: result.data as unknown as LifecycleQueryApiResult,
    };
};

export const createAidPostViaApi = async (
    input: AidPostCreateApiInput,
    signal?: AbortSignal,
): Promise<ApiClientResult<FeedRecordEnvelope>> => {
    const body = {
        authorDid: input.authorDid,
        title: input.draft.title,
        description: input.draft.description,
        category: input.draft.category,
        urgency: toLexiconUrgency(input.draft.urgency),
        latitude: Number(input.draft.location.lat.toFixed(6)),
        longitude: Number(input.draft.location.lng.toFixed(6)),
        precisionKm: Number(
            (input.draft.location.precisionMeters / 1000).toFixed(3),
        ),
        rkey: input.rkey,
        now: input.now,
        trustScore: input.trustScore,
    };

    const result = await requestJsonPost('/aid/post/create', body, signal);
    if (!result.ok) {
        return result;
    }

    const mapped = mapAidPayloadToRecords({
        results: [result.data],
    });

    const [createdRecord] = mapped;
    if (!createdRecord) {
        return {
            ok: false,
            error: 'Aid post create response was malformed.',
        };
    }

    return {
        ok: true,
        data: createdRecord,
    };
};
