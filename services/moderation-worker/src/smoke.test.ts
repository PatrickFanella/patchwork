import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '@patchwork/shared';

describe('moderation worker shell', () => {
    it('references shared contracts', () => {
        expect(CONTRACT_VERSION).toBeDefined();
    });
});
