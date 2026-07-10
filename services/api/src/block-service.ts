import { z, ZodError } from 'zod';
import { didSchema } from '@patchwork/shared';
import type { AuthorizationContext } from './authorization-guard.js';
import type { BlockRepository } from './db/block-repository.js';

const PRIVATE_RECORD_RETENTION_MILLISECONDS = 365 * 24 * 60 * 60 * 1000;

const blockInputSchema = z.object({
    commandId: z.string().min(1).max(200),
    subjectDid: didSchema,
    reason: z.string().min(1).max(500).optional(),
    now: z.string().datetime({ offset: true }).optional(),
});

export class BlockService {
    constructor(private readonly repository: BlockRepository) {}

    async block(
        body: unknown,
        auth: AuthorizationContext,
    ): Promise<{
        statusCode: number;
        body:
            | { blockId: string; created: boolean }
            | { error: { code: string; message: string } };
    }> {
        try {
            const input = blockInputSchema.parse(body);
            if (input.subjectDid === auth.actorDid) {
                return {
                    statusCode: 400,
                    body: {
                        error: {
                            code: 'INVALID_SUBJECT',
                            message: 'An account cannot block itself.',
                        },
                    },
                };
            }
            const now = input.now ?? new Date().toISOString();
            const result = await this.repository.create({
                commandId: input.commandId,
                blockerDid: auth.actorDid,
                subjectDid: input.subjectDid,
                reason: input.reason,
                retentionUntil: new Date(
                    new Date(now).getTime() +
                        PRIVATE_RECORD_RETENTION_MILLISECONDS,
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
                            code: 'INVALID_BLOCK',
                            message: 'Block request failed validation.',
                        },
                    },
                };
            }
            throw error;
        }
    }
}
