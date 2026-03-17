import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '@patchwork/shared';

describe('indexer service shell', () => {
    it('references shared contracts', () => {
        expect(CONTRACT_VERSION).toBe('0.9.0-phase9');
    });
});
