import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoreFlowSurfaces } from './CoreFlowSurfaces';

describe('CoreFlowSurfaces', () => {
    it('renders section heading and all surface card titles', () => {
        const html = renderToStaticMarkup(<CoreFlowSurfaces />);

        expect(html).toContain('Core flow surfaces');
        expect(html).toContain('Feed lifecycle');
        expect(html).toContain('Posting validation');
        expect(html).toContain('Resource directory');
        expect(html).toContain('Volunteer onboarding');
    });
});
