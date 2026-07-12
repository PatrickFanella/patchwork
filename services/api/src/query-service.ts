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
    type ProjectionFreshness,
} from '@patchwork/shared';
import type { Pool } from 'pg';

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

    queryMap(params: URLSearchParams, _viewerDid?: string): ApiRouteResult {
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

    queryFeed(params: URLSearchParams, _viewerDid?: string): ApiRouteResult {
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

interface ProjectionRow {
    uri: string;
    cid: string | null;
    title: string;
    description: string;
    category: string;
    urgency: string;
    status: string;
    searchable_text: string;
    latitude: number;
    longitude: number;
    precision_km: number;
    record_created_at: Date | string;
    record_updated_at: Date | string;
    source_cursor: string | number;
    projected_at: Date | string;
}

interface ProjectionStateRow {
    latest_cursor: string | number | null;
    heartbeat_at: Date | string;
}

const authorDidFromUri = (uri: string): string => {
    const match = /^at:\/\/([^/]+)\//.exec(uri);
    if (!match?.[1]) throw new Error('Projection URI does not contain an author DID.');
    return match[1];
};

const freshnessForRows = (
    rows: readonly ProjectionRow[],
    state: ProjectionStateRow | undefined,
): ProjectionFreshness => {
    if (!state) {
        return { latestCursor: null, projectedAt: null, lagSeconds: null };
    }
    const observedAtMs = new Date(state.heartbeat_at).getTime();
    const projectedAtMs =
        rows.length === 0 ? null : Math.max(
            ...rows.map(row => new Date(row.projected_at).getTime()),
        );
    return {
        latestCursor:
            state.latest_cursor === null ? null : Number(state.latest_cursor),
        projectedAt:
            projectedAtMs === null ? null : new Date(projectedAtMs).toISOString(),
        observedAt: new Date(observedAtMs).toISOString(),
        lagSeconds: Math.max(0, (Date.now() - observedAtMs) / 1_000),
    };
};

export const assessProjectionReadiness = (
    freshness: ProjectionFreshness,
    maxLagSeconds: number,
): { ready: true } | { ready: false; reason: string } => {
    if (freshness.lagSeconds === null) {
        return { ready: false, reason: 'Projection freshness is unavailable' };
    }
    if (freshness.lagSeconds > maxLagSeconds) {
        return {
            ready: false,
            reason: `Projection lag exceeds ${maxLagSeconds} seconds`,
        };
    }
    return { ready: true };
};

export class PostgresProjectionQueryService {
    constructor(private readonly pool: Pool) {}

    async queryMap(
        params: URLSearchParams,
        viewerDid?: string,
    ): Promise<ApiRouteResult> {
        return this.queryAid(params, 'map', viewerDid);
    }

    async queryFeed(
        params: URLSearchParams,
        viewerDid?: string,
    ): Promise<ApiRouteResult> {
        return this.queryAid(params, 'feed', viewerDid);
    }

    async queryDirectory(params: URLSearchParams): Promise<ApiRouteResult> {
        const snapshot = await this.loadSnapshot();
        const service = createQueryServiceFromNormalizedEvents([]);
        const result = service.queryDirectory(params);
        if ('error' in result.body) return result;
        return {
            ...result,
            body: {
                ...result.body,
                projectionFreshness: snapshot.freshness,
            },
        };
    }

    async getFreshness(): Promise<ProjectionFreshness> {
        return (await this.loadSnapshot()).freshness;
    }

    private async queryAid(
        params: URLSearchParams,
        scope: 'map' | 'feed',
        viewerDid?: string,
    ): Promise<ApiRouteResult> {
        const snapshot = await this.loadSnapshot(viewerDid);
        const service = createQueryServiceFromNormalizedEvents(snapshot.events);
        const result =
            scope === 'map' ? service.queryMap(params) : service.queryFeed(params);
        if ('error' in result.body) return result;
        return {
            ...result,
            body: {
                ...result.body,
                projectionFreshness: snapshot.freshness,
            },
        };
    }

    private async loadSnapshot(viewerDid?: string): Promise<{
        events: NormalizedFirehoseEvent[];
        freshness: ProjectionFreshness;
    }> {
        const [result, stateResult, blockResult] = await Promise.all([
            this.pool.query<ProjectionRow>(
            `SELECT uri, cid, title, description, category, urgency, status,
                    searchable_text, latitude, longitude, precision_km,
                    record_created_at, record_updated_at, source_cursor,
                    projected_at
             FROM indexer_aid_post_projections
             ORDER BY source_cursor, uri`,
            ),
            this.pool.query<ProjectionStateRow>(
                `SELECT latest_cursor, heartbeat_at
                 FROM indexer_projection_state
                 WHERE singleton = TRUE`,
            ),
            viewerDid ?
                this.pool.query<{ excluded_did: string }>(
                    `SELECT CASE
                         WHEN blocker_did = $1 THEN subject_did
                         ELSE blocker_did
                     END AS excluded_did
                     FROM user_blocks
                     WHERE (blocker_did = $1 OR subject_did = $1)
                       AND deleted_at IS NULL
                       AND (retention_until IS NULL OR retention_until > NOW())`,
                    [viewerDid],
                )
            :   Promise.resolve({ rows: [] as { excluded_did: string }[] }),
        ]);
        const excludedDids = new Set(
            blockResult.rows.map(row => row.excluded_did),
        );
        const events: NormalizedFirehoseEvent[] = result.rows
            .filter(row => !excludedDids.has(authorDidFromUri(row.uri)))
            .map(row => ({
                eventId: `projection:${row.source_cursor}:${row.uri}`,
                seq: Number(row.source_cursor),
                action: 'create',
                uri: row.uri,
                collection: 'app.patchwork.aid.post',
                authorDid: authorDidFromUri(row.uri),
                ...(row.cid ? { cid: row.cid } : {}),
                receivedAt: new Date(row.record_updated_at).toISOString(),
                payload: {
                    kind: 'aid-post',
                    title: row.title,
                    description: row.description,
                    category: row.category as 'food',
                    urgency: row.urgency as 'high',
                    status: row.status as 'open',
                    searchableText: row.searchable_text,
                    approximateGeo: {
                        latitude: Number(row.latitude),
                        longitude: Number(row.longitude),
                        precisionKm: Number(row.precision_km),
                    },
                    createdAt: new Date(row.record_created_at).toISOString(),
                    updatedAt: new Date(row.record_updated_at).toISOString(),
                    trustScore: 0.5,
                },
            }));
        return {
            events,
            freshness: freshnessForRows(result.rows, stateResult.rows[0]),
        };
    }
}
