import {
    defaultUserSettings,
    diffSettings,
    userSettingsSchema,
    type AccountAction,
    type SettingsChangeAudit,
    type UserSettings,
} from '@patchwork/shared';
import {
    type AuthorizationContext,
    AuthorizationError,
    requireCapability,
    requireOwnerOrRole,
} from './authorization-guard.js';

export interface ApiSettingsRouteResult {
    statusCode: number;
    body: unknown;
}

/**
 * In-memory settings store keyed by DID.
 * Production would persist to Postgres; this fixture store is sufficient
 * for Wave 0 demonstration and test coverage.
 */
export class ApiSettingsService {
    private readonly settingsByDid = new Map<string, UserSettings>();
    private readonly auditLog: SettingsChangeAudit[] = [];
    private readonly accountActions: Array<{
        did: string;
        action: AccountAction;
        reason?: string;
        requestedAt: string;
    }> = [];

    // -----------------------------------------------------------------
    // GET /account/settings?did=...
    //
    // When authCtx is provided, users can only read their own settings
    // unless they have admin role or above.
    // -----------------------------------------------------------------

    getSettings(
        params: URLSearchParams,
        authCtx?: AuthorizationContext,
    ): ApiSettingsRouteResult {
        const did = params.get('did')?.trim();
        if (!did) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_DID',
                        message: 'Query parameter "did" is required.',
                    },
                },
            };
        }

        if (authCtx) {
            try {
                requireCapability(authCtx, 'read:own_profile');
                requireOwnerOrRole(authCtx, did, 'admin');
            } catch (err) {
                if (err instanceof AuthorizationError) {
                    return {
                        statusCode: err.statusCode,
                        body: {
                            error: {
                                code: err.code,
                                message: err.message,
                            },
                        },
                    };
                }
                throw err;
            }
        }

        const settings = this.settingsByDid.get(did) ?? { ...defaultUserSettings };

        return {
            statusCode: 200,
            body: { did, settings },
        };
    }

    // -----------------------------------------------------------------
    // PUT /account/settings  (body: { did, settings })
    //
    // When authCtx is provided, users can only update their own settings
    // unless they have admin role or above.
    // -----------------------------------------------------------------

    updateSettings(
        body: unknown,
        authCtx?: AuthorizationContext,
    ): ApiSettingsRouteResult {
        if (typeof body !== 'object' || body === null) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'INVALID_BODY',
                        message: 'Request body must be a JSON object.',
                    },
                },
            };
        }

        const record = body as Record<string, unknown>;
        const did =
            typeof record['did'] === 'string' ? record['did'].trim() : '';
        if (!did) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_DID',
                        message: 'Field "did" is required in the request body.',
                    },
                },
            };
        }

        if (authCtx) {
            try {
                requireCapability(authCtx, 'edit:own_profile');
                requireOwnerOrRole(authCtx, did, 'admin');
            } catch (err) {
                if (err instanceof AuthorizationError) {
                    return {
                        statusCode: err.statusCode,
                        body: {
                            error: {
                                code: err.code,
                                message: err.message,
                            },
                        },
                    };
                }
                throw err;
            }
        }

        const parseResult = userSettingsSchema.safeParse(record['settings']);
        if (!parseResult.success) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'INVALID_SETTINGS',
                        message: 'Settings payload failed validation.',
                        details: parseResult.error.flatten().fieldErrors,
                    },
                },
            };
        }

        const previous =
            this.settingsByDid.get(did) ?? { ...defaultUserSettings };
        const next = parseResult.data as UserSettings;
        const now = new Date().toISOString();

        const audits = diffSettings(previous, next, did, now);
        this.auditLog.push(...audits);

        this.settingsByDid.set(did, next);

        return {
            statusCode: 200,
            body: {
                did,
                settings: next,
                changesRecorded: audits.length,
            },
        };
    }

    // -----------------------------------------------------------------
    // POST /account/settings/audit  (body: { did })
    // -----------------------------------------------------------------

    getAuditTrail(body: unknown): ApiSettingsRouteResult {
        if (typeof body !== 'object' || body === null) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'INVALID_BODY',
                        message: 'Request body must be a JSON object.',
                    },
                },
            };
        }

        const record = body as Record<string, unknown>;
        const did =
            typeof record['did'] === 'string' ? record['did'].trim() : '';
        if (!did) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_DID',
                        message: 'Field "did" is required in the request body.',
                    },
                },
            };
        }

        const entries = this.auditLog.filter(entry => entry.actor === did);

        return {
            statusCode: 200,
            body: {
                did,
                total: entries.length,
                entries,
            },
        };
    }

    // -----------------------------------------------------------------
    // POST /account/deactivate  (body: { did, reason? })
    // -----------------------------------------------------------------

    deactivateAccount(body: unknown): ApiSettingsRouteResult {
        return this.handleAccountAction(body, 'deactivate');
    }

    // -----------------------------------------------------------------
    // POST /account/export  (body: { did, reason? })
    // -----------------------------------------------------------------

    exportAccountData(body: unknown): ApiSettingsRouteResult {
        return this.handleAccountAction(body, 'export');
    }

    // -----------------------------------------------------------------
    // Shared account-action handler
    // -----------------------------------------------------------------

    private handleAccountAction(
        body: unknown,
        action: AccountAction,
    ): ApiSettingsRouteResult {
        if (typeof body !== 'object' || body === null) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'INVALID_BODY',
                        message: 'Request body must be a JSON object.',
                    },
                },
            };
        }

        const record = body as Record<string, unknown>;
        const did =
            typeof record['did'] === 'string' ? record['did'].trim() : '';
        if (!did) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_DID',
                        message: 'Field "did" is required in the request body.',
                    },
                },
            };
        }

        const reason =
            typeof record['reason'] === 'string' ? record['reason'] : undefined;
        const now = new Date().toISOString();

        this.accountActions.push({
            did,
            action,
            reason,
            requestedAt: now,
        });

        // Record to audit log as well
        this.auditLog.push({
            field: `account.${action}`,
            oldValue: 'active',
            newValue: action,
            timestamp: now,
            actor: did,
        });

        return {
            statusCode: 200,
            body: {
                did,
                action,
                status: 'initiated',
                requestedAt: now,
                message:
                    action === 'deactivate'
                        ? 'Account deactivation has been initiated. You will receive confirmation.'
                        : 'Data export has been initiated. You will receive a download link.',
            },
        };
    }

    // -----------------------------------------------------------------
    // Test-only accessors
    // -----------------------------------------------------------------

    getAuditLogForTesting(): readonly SettingsChangeAudit[] {
        return this.auditLog;
    }

    getAccountActionsForTesting(): readonly {
        did: string;
        action: AccountAction;
        reason?: string;
        requestedAt: string;
    }[] {
        return this.accountActions;
    }
}

export const createFixtureSettingsService = (): ApiSettingsService => {
    return new ApiSettingsService();
};
