import { ZodError } from 'zod';
import {
    DiscoveryIndexStore,
    FirehoseConsumer,
    buildPhase3FixtureFirehoseEvents,
    validateAidQueryInput,
    validateDirectoryQueryInput,
    type ApiQueryAidResponse,
    type ApiQueryDirectoryResponse,
    type ApiQueryErrorResponse,
    type NormalizedFirehoseEvent,
} from '@patchwork/shared';
import {
    createPostgresPool,
    loadDiscoveryEvents,
} from './db/discovery-events.js';

export interface ApiRouteResult {
    statusCode: number;
    body:
        | ApiQueryAidResponse
        | ApiQueryDirectoryResponse
        | ApiQueryErrorResponse;
}

const readNumber = (
    params: URLSearchParams,
    key: string,
): number | undefined => {
    const value = params.get(key);
    if (value === null || value.trim() === '') {
        return undefined;
    }

    return Number(value);
};

const readString = (
    params: URLSearchParams,
    key: string,
): string | undefined => {
    const value = params.get(key);
    if (value === null || value.trim() === '') {
        return undefined;
    }

    return value;
};

const formatValidationError = (error: ZodError): ApiQueryErrorResponse => {
    return {
        error: {
            code: 'INVALID_QUERY',
            message: 'Query parameters failed validation.',
            details: {
                issues: error.issues.map(issue => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                })),
            },
        },
    };
};

export class ApiDiscoveryQueryService {
    constructor(private readonly store: DiscoveryIndexStore) {}

    applyNormalizedEvents(events: readonly NormalizedFirehoseEvent[]): void {
        this.store.applyEvents(events);
    }

    queryMap(params: URLSearchParams): ApiRouteResult {
        try {
            const input = validateAidQueryInput({
                latitude: readNumber(params, 'latitude'),
                longitude: readNumber(params, 'longitude'),
                radiusKm: readNumber(params, 'radiusKm'),
                category: readString(params, 'category'),
                urgency: readString(params, 'urgency'),
                status: readString(params, 'status'),
                freshnessHours: readNumber(params, 'freshnessHours'),
                searchText: readString(params, 'searchText'),
                page: readNumber(params, 'page'),
                pageSize: readNumber(params, 'pageSize'),
            });

            const result = this.store.queryMap(input);
            return {
                statusCode: 200,
                body: {
                    total: result.total,
                    page: result.page,
                    pageSize: result.pageSize,
                    hasNextPage: result.hasNextPage,
                    results: result.items,
                },
            };
        } catch (error) {
            if (error instanceof ZodError) {
                return {
                    statusCode: 400,
                    body: formatValidationError(error),
                };
            }

            throw error;
        }
    }

    queryFeed(params: URLSearchParams): ApiRouteResult {
        try {
            const input = validateAidQueryInput({
                latitude: readNumber(params, 'latitude'),
                longitude: readNumber(params, 'longitude'),
                radiusKm: readNumber(params, 'radiusKm'),
                category: readString(params, 'category'),
                urgency: readString(params, 'urgency'),
                status: readString(params, 'status'),
                freshnessHours: readNumber(params, 'freshnessHours'),
                searchText: readString(params, 'searchText'),
                page: readNumber(params, 'page'),
                pageSize: readNumber(params, 'pageSize'),
            });

            const result = this.store.queryFeed(input);
            return {
                statusCode: 200,
                body: {
                    total: result.total,
                    page: result.page,
                    pageSize: result.pageSize,
                    hasNextPage: result.hasNextPage,
                    results: result.items,
                },
            };
        } catch (error) {
            if (error instanceof ZodError) {
                return {
                    statusCode: 400,
                    body: formatValidationError(error),
                };
            }

            throw error;
        }
    }

    queryDirectory(params: URLSearchParams): ApiRouteResult {
        try {
            const input = validateDirectoryQueryInput({
                category: readString(params, 'category'),
                status: readString(params, 'status'),
                operationalStatus: readString(params, 'operationalStatus'),
                latitude: readNumber(params, 'latitude'),
                longitude: readNumber(params, 'longitude'),
                radiusKm: readNumber(params, 'radiusKm'),
                freshnessHours: readNumber(params, 'freshnessHours'),
                searchText: readString(params, 'searchText'),
                page: readNumber(params, 'page'),
                pageSize: readNumber(params, 'pageSize'),
            });

            const result = this.store.queryDirectory(input);
            return {
                statusCode: 200,
                body: {
                    total: result.total,
                    page: result.page,
                    pageSize: result.pageSize,
                    hasNextPage: result.hasNextPage,
                    results: result.items,
                },
            };
        } catch (error) {
            if (error instanceof ZodError) {
                return {
                    statusCode: 400,
                    body: formatValidationError(error),
                };
            }

            throw error;
        }
    }
}

const createQueryServiceFromNormalizedEvents = (
    normalizedEvents: readonly NormalizedFirehoseEvent[],
): ApiDiscoveryQueryService => {
    const store = new DiscoveryIndexStore();
    store.applyEvents(normalizedEvents);
    return new ApiDiscoveryQueryService(store);
};

export const createFixtureQueryService = (): ApiDiscoveryQueryService => {
    const consumer = new FirehoseConsumer();
    const ingested = consumer.ingest(buildPhase3FixtureFirehoseEvents());
    return createQueryServiceFromNormalizedEvents(ingested.normalizedEvents);
};

export const createPostgresQueryService = async (
    databaseUrl: string,
): Promise<ApiDiscoveryQueryService> => {
    const pool = createPostgresPool(databaseUrl);

    try {
        const normalizedEvents = await loadDiscoveryEvents(pool);
        return createQueryServiceFromNormalizedEvents(normalizedEvents);
    } finally {
        await pool.end();
    }
};
