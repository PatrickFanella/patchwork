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
import {
    defaultDiscoveryCenter,
    type FeedRecordEnvelope,
} from './discovery-runtime';
import type {
    SettingsChangeAudit,
    UserSettings,
} from '@patchwork/shared';
import {
    aidPostSchema,
    type AidPostRecord,
} from '@patchwork/at-lexicons';

export type ApiDataOrigin = 'api' | 'fixture' | 'unavailable';

export interface ApiClientSuccess<TData> {
    ok: true;
    data: TData;
}

export interface ApiClientFailure {
    ok: false;
    error: string;
    code: string;
    kind: 'network' | 'authentication' | 'validation' | 'conflict' | 'server';
    retryable: boolean;
}

export type ApiClientResult<TData> = ApiClientSuccess<TData> | ApiClientFailure;

export type AidPostReportReason = 'spam' | 'abuse' | 'fraud' | 'other';

export interface SafetyMutationResult {
    created: boolean;
}

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
    draft: NormalizedAidPostingDraft;
    rkey: string;
    now?: string;
    trustScore?: number;
}

const DEFAULT_API_BASE_URL = 'http://localhost:4000';
const REQUEST_TIMEOUT_MS = 6_000;
const DEFAULT_NEARBY_RADIUS_KM = 20;
const DEFAULT_FEED_RADIUS_KM = 100;

const csrfHeaders = (): Record<string, string> => {
    if (typeof document === 'undefined') return {};
    for (const cookie of document.cookie.split(';')) {
        const [name, ...parts] = cookie.trim().split('=');
        if (name === 'patchwork_csrf') {
            try {
                return { 'x-csrf-token': decodeURIComponent(parts.join('=')) };
            } catch {
                return {};
            }
        }
    }
    return {};
};

const newIdempotencyKey = (): string => globalThis.crypto.randomUUID();

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

const toErrorCode = (payload: unknown, fallback: string): string => {
    if (!isRecord(payload) || !isRecord(payload['error'])) return fallback;
    return readString(payload['error'], 'code') ?? fallback;
};

const failureForResponse = (
    payload: unknown,
    status: number,
): ApiClientFailure => {
    const kind: ApiClientFailure['kind'] =
        status === 401 || status === 403 ? 'authentication'
        : status === 409 ? 'conflict'
        : status === 400 || status === 422 ? 'validation'
        : 'server';
    return {
        ok: false,
        error: toErrorMessage(payload, `API request failed (${status}).`),
        code: toErrorCode(payload, `HTTP_${status}`),
        kind,
        retryable: status === 408 || status === 429 || status >= 500,
    };
};

const networkFailure = (error: unknown): ApiClientFailure => ({
    ok: false,
    error:
        error instanceof Error ? error.message : 'Unable to reach API endpoint.',
    code: error instanceof DOMException && error.name === 'AbortError' ?
        'REQUEST_TIMEOUT'
    :   'NETWORK_ERROR',
    kind: 'network',
    retryable: true,
});

const invalidResponseFailure = (message: string): ApiClientFailure => ({
    ok: false,
    error: message,
    code: 'INVALID_API_RESPONSE',
    kind: 'validation',
    retryable: false,
});

const parseSafetyMutationResult = <
    TIdField extends 'reportId' | 'blockId',
>(
    payload: unknown,
    idField: TIdField,
): ApiClientResult<SafetyMutationResult & Record<TIdField, string>> => {
    if (!isRecord(payload)) {
        return invalidResponseFailure('Safety command response was malformed.');
    }
    const id = readString(payload, idField);
    const created = payload['created'];
    if (!id || typeof created !== 'boolean') {
        return invalidResponseFailure('Safety command response was malformed.');
    }
    return {
        ok: true,
        data: { [idField]: id, created } as unknown as SafetyMutationResult &
            Record<TIdField, string>,
    };
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
            credentials: 'include',
            headers: {
                accept: 'application/json',
            },
            signal: controller.signal,
        });

        const payload = await response.json().catch(() => undefined);

        if (!response.ok) {
            return failureForResponse(payload, response.status);
        }

        return {
            ok: true,
            data: payload,
        };
    } catch (error) {
        return networkFailure(error);
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
                credentials: 'include',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                    'idempotency-key': newIdempotencyKey(),
                    ...csrfHeaders(),
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            },
        );

        const payload = await response.json().catch(() => undefined);

        if (!response.ok) {
            return failureForResponse(payload, response.status);
        }

        return {
            ok: true,
            data: payload,
        };
    } catch (error) {
        return networkFailure(error);
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
                credentials: 'include',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                    'idempotency-key': newIdempotencyKey(),
                    ...csrfHeaders(),
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            },
        );

        const payload = await response.json().catch(() => undefined);

        if (!response.ok) {
            return failureForResponse(payload, response.status);
        }

        return {
            ok: true,
            data: payload,
        };
    } catch (error) {
        return networkFailure(error);
    } finally {
        clearTimeout(timeoutId);
    }
};

const requestJsonDelete = async (
    path: string,
    body: unknown,
    signal?: AbortSignal,
): Promise<ApiClientResult<unknown>> => {
    try {
        const response = await fetch(
            resolveApiUrl(path, new URLSearchParams()),
            {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                    'idempotency-key': newIdempotencyKey(),
                    ...csrfHeaders(),
                },
                body: JSON.stringify(body),
                signal,
            },
        );
        if (response.status === 204) return { ok: true, data: undefined };
        const payload = await response.json().catch(() => undefined);
        return response.ok ?
                { ok: true, data: payload }
            :   failureForResponse(payload, response.status);
    } catch (error) {
        return networkFailure(error);
    }
};

export interface AtAidPostResult {
    uri: string;
    cid: string;
    record: AidPostRecord;
}

const parseAtAidPostResult = (
    payload: unknown,
): ApiClientResult<AtAidPostResult> => {
    if (!isRecord(payload)) {
        return invalidResponseFailure('Aid-post response was malformed.');
    }
    const uri = readString(payload, 'uri');
    const cid = readString(payload, 'cid');
    const record = aidPostSchema.safeParse(payload['record']);
    if (!uri || !cid || !record.success) {
        return invalidResponseFailure('Aid-post response was malformed.');
    }
    return { ok: true, data: { uri, cid, record: record.data } };
};

export const createAtAidPostViaApi = async (
    record: AidPostRecord,
    signal?: AbortSignal,
): Promise<ApiClientResult<AtAidPostResult>> => {
    const result = await requestJsonPost('/at/aid-posts', record, signal);
    return result.ok ? parseAtAidPostResult(result.data) : result;
};

export const updateAtAidPostViaApi = async (
    input: { uri: string; expectedCid: string; record: AidPostRecord },
    signal?: AbortSignal,
): Promise<ApiClientResult<AtAidPostResult>> => {
    const result = await requestJsonPut('/at/aid-posts', input, signal);
    return result.ok ? parseAtAidPostResult(result.data) : result;
};

export const closeAtAidPostViaApi = async (
    input: { uri: string; expectedCid: string; updatedAt: string },
    signal?: AbortSignal,
): Promise<ApiClientResult<AtAidPostResult>> => {
    const result = await requestJsonPost('/at/aid-posts/close', input, signal);
    return result.ok ? parseAtAidPostResult(result.data) : result;
};

export const deleteAtAidPostViaApi = async (
    input: { uri: string; expectedCid: string },
    signal?: AbortSignal,
): Promise<ApiClientResult<void>> => {
    const result = await requestJsonDelete('/at/aid-posts', input, signal);
    return result.ok ? { ok: true, data: undefined } : result;
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

export interface AccountExportApiResponse {
    formatVersion: '1.0';
    generatedAt: string;
    subject: { did: string; handle?: string };
    data: Record<string, unknown>;
    exclusions: Array<{ category: string; reason: string }>;
}

export const fetchSettingsFromApi = async (
    _did: string,
    signal?: AbortSignal,
): Promise<ApiClientResult<SettingsApiGetResponse>> => {
    const result = await requestJsonPost('/account/settings/read', {}, signal);

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return invalidResponseFailure('Settings response was malformed.');
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
        return invalidResponseFailure('Settings update response was malformed.');
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
        return invalidResponseFailure('Audit trail response was malformed.');
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
        return invalidResponseFailure('Deactivation response was malformed.');
    }

    return {
        ok: true,
        data: result.data as unknown as AccountActionApiResponse,
    };
};

export const exportDataViaApi = async (
    signal?: AbortSignal,
): Promise<ApiClientResult<AccountExportApiResponse>> => {
    const result = await requestJson(
        '/account/export',
        new URLSearchParams(),
        signal,
    );

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return invalidResponseFailure('Export response was malformed.');
    }

    const formatVersion = result.data['formatVersion'];
    const generatedAt = result.data['generatedAt'];
    const subject = result.data['subject'];
    const data = result.data['data'];
    const exclusions = result.data['exclusions'];
    if (
        formatVersion !== '1.0' ||
        typeof generatedAt !== 'string' ||
        !isRecord(subject) ||
        typeof subject['did'] !== 'string' ||
        !isRecord(data) ||
        !Array.isArray(exclusions)
    ) {
        return invalidResponseFailure('Export response was malformed.');
    }
    return {
        ok: true,
        data: result.data as unknown as AccountExportApiResponse,
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

const parseRepositoryDidFromUri = (uri: string): string | undefined =>
    /^at:\/\/(did:[^/]+)\//.exec(uri)?.[1];

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

const mapAidPayloadToRecords = (
    payload: unknown,
): FeedRecordEnvelope[] | undefined => {
    if (!isRecord(payload)) {
        return [];
    }

    const rows = payload['results'];
    if (!Array.isArray(rows)) {
        return [];
    }

    const mapped = rows.map((row, index) => {
            if (!isRecord(row)) {
                return undefined;
            }

            const uri = readString(row, 'uri');
            const authorDid = readString(row, 'authorDid');
            const cid = readString(row, 'cid');
            const title = readString(row, 'title');
            const summary = readString(row, 'summary');
            const category = readString(row, 'category');
            const status = readString(row, 'status');
            const urgency = readString(row, 'urgency');
            const updatedAt = readString(row, 'updatedAt');
            if (
                !uri ||
                !authorDid ||
                !title ||
                !summary ||
                !category ||
                !status ||
                !urgency ||
                !updatedAt
            ) {
                return undefined;
            }

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
                updatedAt;

            return {
                aidPostUri: uri,
                recipientDid: authorDid,
                ...(cid ? { cid } : {}),
                card: createFeedCard({
                    id: parseRecordIdFromUri(uri, `remote-${index}`),
                    title,
                    description: summary,
                    category: parseAidCategory(category),
                    status: parseAidStatus(status),
                    urgency: parseUrgency(urgency),
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
        });
    if (mapped.some(value => value === undefined)) return undefined;
    return mapped as FeedRecordEnvelope[];
};

const mapDirectoryPayloadToCards = (
    payload: unknown,
): ResourceDirectoryCard[] | undefined => {
    if (!isRecord(payload)) {
        return [];
    }

    const rows = payload['results'];
    if (!Array.isArray(rows)) {
        return [];
    }

    const hasMalformedRow = rows.some(row => {
        if (!isRecord(row)) return true;
        const approximateGeo = row['approximateGeo'];
        return (
            !readString(row, 'uri') ||
            !readString(row, 'name') ||
            !isRecord(approximateGeo) ||
            (readNumber(approximateGeo, 'latitude') ??
                readNumber(approximateGeo, 'lat')) === undefined ||
            (readNumber(approximateGeo, 'longitude') ??
                readNumber(approximateGeo, 'lng')) === undefined
        );
    });
    if (hasMalformedRow) return undefined;

    return rows.reduce<ResourceDirectoryCard[]>((cards, row, index) => {
        if (!isRecord(row)) {
            return cards;
        }

        const uri = readString(row, 'uri');
        const name = readString(row, 'name');
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

        if (!uri || !name || lat === undefined || lng === undefined) {
            return cards;
        }

        const contact = isRecord(row['contact']) ? row['contact'] : {};

        cards.push({
            uri,
            id: parseRecordIdFromUri(uri, `remote-${index}`),
            name,
            category: parseDirectoryCategory(readString(row, 'category')),
            location: {
                lat,
                lng,
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

    const records = mapAidPayloadToRecords(result.data);
    return records ? { ok: true, data: records }
    : invalidResponseFailure('Discovery response was malformed.');
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

    const cards = mapDirectoryPayloadToCards(result.data);
    return cards ? { ok: true, data: cards }
    : invalidResponseFailure('Directory response was malformed.');
};

export const reportAidPostViaApi = async (
    input: {
        subjectUri: string;
        reason: AidPostReportReason;
        details?: string;
    },
    signal?: AbortSignal,
): Promise<ApiClientResult<SafetyMutationResult & { reportId: string }>> => {
    const commandId = newIdempotencyKey();
    const result = await requestJsonPost(
        '/reports',
        { commandId, ...input },
        signal,
    );
    if (!result.ok) return result;
    return parseSafetyMutationResult(result.data, 'reportId');
};

export const blockUserViaApi = async (
    input: { subjectDid: string; reason?: string },
    signal?: AbortSignal,
): Promise<ApiClientResult<SafetyMutationResult & { blockId: string }>> => {
    const commandId = newIdempotencyKey();
    const result = await requestJsonPost(
        '/blocks',
        { commandId, ...input },
        signal,
    );
    if (!result.ok) return result;
    return parseSafetyMutationResult(result.data, 'blockId');
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
    const result = await requestJsonPost('/chat/initiate', input, signal);
    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return invalidResponseFailure('Chat initiation response was malformed.');
    }

    const conversationUri = readString(result.data, 'conversationUri');
    if (!conversationUri) {
        return invalidResponseFailure(
            'Chat initiation did not return a conversation URI.',
        );
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
        return invalidResponseFailure(
            'Lifecycle transition response was malformed.',
        );
    }

    return {
        ok: true,
        data: result.data as unknown as LifecycleTransitionApiResult,
    };
};

export const queryAidPostLifecycleViaApi = async (
    postUri: string,
    _actorRole?: string,
    signal?: AbortSignal,
): Promise<ApiClientResult<LifecycleQueryApiResult>> => {
    const result = await requestJsonPost('/aid/post/lifecycle/query', { postUri }, signal);

    if (!result.ok) {
        return result;
    }

    if (!isRecord(result.data)) {
        return invalidResponseFailure('Lifecycle query response was malformed.');
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
    const now = input.now ?? new Date().toISOString();
    const record = aidPostSchema.parse({
        $type: 'app.patchwork.aid.post',
        version: '1.0.0',
        title: input.draft.title,
        description: input.draft.description,
        category: input.draft.category,
        urgency: toLexiconUrgency(input.draft.urgency),
        status: 'open',
        location: {
            latitude: Number(input.draft.location.lat.toFixed(2)),
            longitude: Number(input.draft.location.lng.toFixed(2)),
            precisionKm: Math.max(
                1,
                Number((input.draft.location.precisionMeters / 1000).toFixed(3)),
            ),
        },
        createdAt: now,
        updatedAt: now,
    });

    const result = await createAtAidPostViaApi(record, signal);
    if (!result.ok) {
        return result;
    }
    const recipientDid = parseRepositoryDidFromUri(result.data.uri);
    if (!recipientDid) {
        return invalidResponseFailure(
            'Created aid-post URI did not contain a repository DID.',
        );
    }

    return {
        ok: true,
        data: {
            aidPostUri: result.data.uri,
            recipientDid,
            cid: result.data.cid,
            card: createFeedCard({
                id: parseRecordIdFromUri(result.data.uri, input.rkey),
                title: record.title,
                description: record.description,
                category: record.category,
                status: 'open',
                urgency: input.draft.urgency,
                accessibilityTags: input.draft.accessibilityTags,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt ?? record.createdAt,
                location: {
                    lat: record.location.latitude,
                    lng: record.location.longitude,
                },
            }),
        },
    };
};
