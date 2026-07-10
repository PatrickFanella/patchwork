import { z, ZodError } from 'zod';
import type { AuthorizationContext } from './authorization-guard.js';
import type { ReportRepository } from './db/report-repository.js';

const REPORT_RETENTION_MILLISECONDS = 2 * 365 * 24 * 60 * 60 * 1000;

const reportInputSchema = z.object({
    commandId: z.string().min(1).max(200),
    subjectUri: z.string().regex(/^at:\/\/did:[^/]+\/[^/]+\/[^/]+$/),
    reason: z.enum(['spam', 'abuse', 'fraud', 'other']),
    details: z.string().min(1).max(1000).optional(),
    now: z.string().datetime({ offset: true }).optional(),
});

const subjectDidFromUri = (uri: string): string | undefined =>
    /^at:\/\/(did:[^/]+)\//.exec(uri)?.[1];

export class ReportService {
    constructor(private readonly repository: ReportRepository) {}

    async report(
        body: unknown,
        auth: AuthorizationContext,
    ): Promise<{
        statusCode: number;
        body:
            | { reportId: string; created: boolean }
            | { error: { code: string; message: string } };
    }> {
        try {
            const input = reportInputSchema.parse(body);
            const now = input.now ?? new Date().toISOString();
            const result = await this.repository.create({
                commandId: input.commandId,
                reporterDid: auth.actorDid,
                subjectUri: input.subjectUri,
                subjectDid: subjectDidFromUri(input.subjectUri),
                reason: input.reason,
                details: input.details,
                retentionUntil: new Date(
                    new Date(now).getTime() + REPORT_RETENTION_MILLISECONDS,
                ).toISOString(),
                createdAt: now,
            });
            return {
                statusCode: result.created ? 201 : 200,
                body: result,
            };
        } catch (error) {
            if (error instanceof ZodError) {
                return {
                    statusCode: 400,
                    body: {
                        error: {
                            code: 'INVALID_REPORT',
                            message: 'Report request failed validation.',
                        },
                    },
                };
            }
            throw error;
        }
    }
}
