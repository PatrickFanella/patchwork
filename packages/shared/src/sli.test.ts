import { describe, expect, it } from 'vitest';
import { SliCollector } from './sli.js';

describe('SliCollector HTTP route metrics', () => {
    it('bounds dynamic paths and emits endpoint/outcome counters', () => {
        const collector = new SliCollector();
        collector.recordHttpRequest('/attachments/uploads/abc123', 201, 12);
        collector.recordHttpRequest('/chat/messages?before=3', 503, 24);

        const rendered = collector.renderPrometheus('api');
        expect(rendered).toContain('endpoint="/attachments/uploads/:id",outcome="2xx"');
        expect(rendered).toContain('endpoint="/chat/messages",outcome="5xx"');
        expect(rendered).toContain('patchwork_http_route_request_total');
        expect(rendered).toContain('patchwork_http_route_error_total');
    });
});
