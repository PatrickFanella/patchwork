/**
 * Mobile API client consuming shared contracts.
 *
 * Mirrors the web api-client pattern but adds mobile-specific concerns:
 * - Device info headers for each request
 * - Auth token injection
 * - Configurable timeout with mobile defaults
 * - Connectivity-aware request gating
 */

import type {
    ApiQueryAidRequest,
    ApiQueryAidResponse,
    MobileAppConfig,
    MobileDeviceInfo,
    ServiceHealth,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MobileApiClientConfig {
    appConfig: MobileAppConfig;
    deviceInfo: MobileDeviceInfo;
    accessToken?: string;
    timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Result types (mirrors web pattern)
// ---------------------------------------------------------------------------

export interface ApiSuccess<TData> {
    ok: true;
    data: TData;
}

export interface ApiFailure {
    ok: false;
    error: string;
    offline?: boolean;
}

export type ApiResult<TData> = ApiSuccess<TData> | ApiFailure;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export class MobileApiClient {
    private readonly baseUrl: string;
    private readonly deviceInfo: MobileDeviceInfo;
    private accessToken: string | undefined;
    private readonly timeoutMs: number;
    private connected: boolean;

    constructor(config: MobileApiClientConfig) {
        this.baseUrl = config.appConfig.apiBaseUrl.replace(/\/$/, '');
        this.deviceInfo = config.deviceInfo;
        this.accessToken = config.accessToken;
        this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.connected = true;
    }

    // -----------------------------------------------------------------------
    // Connection state
    // -----------------------------------------------------------------------

    setConnected(connected: boolean): void {
        this.connected = connected;
    }

    isConnected(): boolean {
        return this.connected;
    }

    setAccessToken(token: string | undefined): void {
        this.accessToken = token;
    }

    // -----------------------------------------------------------------------
    // Headers
    // -----------------------------------------------------------------------

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            accept: 'application/json',
            'x-patchwork-platform': this.deviceInfo.platform,
            'x-patchwork-app-version': this.deviceInfo.appVersion,
            'x-patchwork-os-version': this.deviceInfo.osVersion,
            'x-patchwork-device-id': this.deviceInfo.deviceId,
        };

        if (this.accessToken) {
            headers['authorization'] = `Bearer ${this.accessToken}`;
        }

        return headers;
    }

    // -----------------------------------------------------------------------
    // Low-level request helpers
    // -----------------------------------------------------------------------

    private async requestJson<T>(
        path: string,
        params: URLSearchParams,
    ): Promise<ApiResult<T>> {
        if (!this.connected) {
            return { ok: false, error: 'Device is offline.', offline: true };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const url = `${this.baseUrl}${path}?${params.toString()}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: this.buildHeaders(),
                signal: controller.signal,
            });

            const payload: unknown = await response.json().catch(() => undefined);

            if (!response.ok) {
                const errorMessage =
                    isRecord(payload) && isRecord(payload['error'])
                        ? (payload['error']['message'] as string) ??
                          `Request failed (${response.status}).`
                        : `Request failed (${response.status}).`;
                return { ok: false, error: errorMessage };
            }

            return { ok: true, data: payload as T };
        } catch (error) {
            return {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unable to reach API.',
            };
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async postJson<T>(
        path: string,
        body: unknown,
    ): Promise<ApiResult<T>> {
        if (!this.connected) {
            return { ok: false, error: 'Device is offline.', offline: true };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const url = `${this.baseUrl}${path}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...this.buildHeaders(),
                    'content-type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            const payload: unknown = await response.json().catch(() => undefined);

            if (!response.ok) {
                const errorMessage =
                    isRecord(payload) && isRecord(payload['error'])
                        ? (payload['error']['message'] as string) ??
                          `Request failed (${response.status}).`
                        : `Request failed (${response.status}).`;
                return { ok: false, error: errorMessage };
            }

            return { ok: true, data: payload as T };
        } catch (error) {
            return {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unable to reach API.',
            };
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // -----------------------------------------------------------------------
    // API endpoints
    // -----------------------------------------------------------------------

    async healthCheck(): Promise<ApiResult<ServiceHealth>> {
        return this.requestJson<ServiceHealth>(
            '/health',
            new URLSearchParams(),
        );
    }

    async queryAidRequests(
        request: ApiQueryAidRequest,
    ): Promise<ApiResult<ApiQueryAidResponse>> {
        const params = new URLSearchParams({
            latitude: String(request.latitude),
            longitude: String(request.longitude),
            radiusKm: String(request.radiusKm),
            page: String(request.page ?? 1),
            pageSize: String(request.pageSize ?? 20),
        });

        if (request.category) params.set('category', request.category);
        if (request.urgency) params.set('urgency', request.urgency);
        if (request.status) params.set('status', request.status);
        if (request.searchText) params.set('searchText', request.searchText);
        if (request.freshnessHours)
            params.set('freshnessHours', String(request.freshnessHours));

        return this.requestJson<ApiQueryAidResponse>('/query/feed', params);
    }

    async initiateChat(input: {
        aidPostUri: string;
        initiatedByDid: string;
        recipientDid: string;
        initiatedFrom: 'map' | 'feed' | 'detail';
    }): Promise<
        ApiResult<{
            conversationUri: string;
            created: boolean;
            transportPath: string;
        }>
    > {
        return this.postJson('/chat/initiate', input);
    }

    async registerPushToken(
        pushToken: string,
    ): Promise<ApiResult<{ registered: boolean }>> {
        return this.postJson('/push/register', {
            pushToken,
            platform: this.deviceInfo.platform,
            deviceId: this.deviceInfo.deviceId,
        });
    }
}
