import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '@patchwork/shared';

describe('api service shell', () => {
    it('references shared contracts', () => {
        expect(CONTRACT_VERSION).toContain('phase9');
    });
});
