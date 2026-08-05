import { describe, expect, it } from 'vitest';
import { localizedInboxCopy } from './coordination-service.js';

describe('localized coordination activity copy', () => {
    it('uses Spanish copy without exposing any additional participant data', () => {
        expect(
            localizedInboxCopy(
                'es',
                'New offer on your request',
                'A volunteer offered to help. Their identity stays private until you accept.',
            ),
        ).toEqual({
            title: 'Nueva oferta para tu solicitud',
            summary:
                'Una persona voluntaria se ofreció a ayudar. Su identidad permanece privada hasta que aceptes.',
        });
    });

    it('preserves canonical English copy for English and unknown locales', () => {
        const copy = {
            title: 'Offer closed',
            summary: 'Another offer was accepted for this request.',
        };
        expect(localizedInboxCopy('en', copy.title, copy.summary)).toEqual(
            copy,
        );
        expect(localizedInboxCopy('fr', copy.title, copy.summary)).toEqual(
            copy,
        );
    });
});
