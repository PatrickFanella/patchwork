import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
    it.each([
        ['default', 'mh-badge--default'],
        ['neutral', 'mh-badge--neutral'],
        ['info', 'mh-badge--info'],
        ['danger', 'mh-badge--danger'],
        ['success', 'mh-badge--success'],
    ] as const)('renders the %s semantic tone class', (tone, className) => {
        const html = renderToStaticMarkup(<Badge tone={tone}>Status</Badge>);

        expect(html).toContain(className);
    });
});
