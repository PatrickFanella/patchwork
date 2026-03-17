import { describe, expect, it } from 'vitest';
import {
    ALERT_RULES,
    formatAlertLog,
    type AlertEvent,
    type AlertSeverity,
} from './alerting.js';

describe('ALERT_RULES', () => {
    it('defines all expected rules', () => {
        const expectedNames = [
            'error_rate_high',
            'latency_p95_high',
            'queue_depth_high',
            'checkpoint_stale',
            'disk_usage_high',
            'service_down',
        ];
        expect(Object.keys(ALERT_RULES).sort()).toEqual(expectedNames.sort());
    });

    it('every rule has required fields', () => {
        for (const rule of Object.values(ALERT_RULES)) {
            expect(rule.name).toBeTruthy();
            expect(rule.condition).toBeTruthy();
            expect(rule.severity).toBeTruthy();
            expect(rule.runbookUrl).toContain('https://');
        }
    });

    it('critical rules include error_rate_high, checkpoint_stale, service_down', () => {
        const criticals = Object.values(ALERT_RULES).filter(
            r => r.severity === 'critical',
        );
        const names = criticals.map(r => r.name).sort();
        expect(names).toEqual(
            ['checkpoint_stale', 'error_rate_high', 'service_down'].sort(),
        );
    });

    it('warning rules include latency, queue_depth, disk_usage', () => {
        const warnings = Object.values(ALERT_RULES).filter(
            r => r.severity === 'warning',
        );
        const names = warnings.map(r => r.name).sort();
        expect(names).toEqual(
            ['disk_usage_high', 'latency_p95_high', 'queue_depth_high'].sort(),
        );
    });

    it('rule keys match rule.name values', () => {
        for (const [key, rule] of Object.entries(ALERT_RULES)) {
            expect(key).toBe(rule.name);
        }
    });
});

describe('formatAlertLog', () => {
    const baseEvent: AlertEvent = {
        rule: ALERT_RULES.error_rate_high!,
        timestamp: '2026-03-02T12:00:00.000Z',
        service: 'api',
        details: { errorRate: 0.08, window: '5m' },
        resolved: false,
    };

    it('produces a flat structured log object', () => {
        const log = formatAlertLog(baseEvent);

        expect(log.level).toBe('alert');
        expect(log.alert_name).toBe('error_rate_high');
        expect(log.severity).toBe('critical');
        expect(log.condition).toBe(ALERT_RULES.error_rate_high!.condition);
        expect(log.runbook_url).toBe(ALERT_RULES.error_rate_high!.runbookUrl);
        expect(log.service).toBe('api');
        expect(log.resolved).toBe(false);
        expect(log.timestamp).toBe('2026-03-02T12:00:00.000Z');
        expect(log.details).toEqual({ errorRate: 0.08, window: '5m' });
    });

    it('serialises cleanly to JSON', () => {
        const json = JSON.stringify(formatAlertLog(baseEvent));
        const parsed = JSON.parse(json);
        expect(parsed.alert_name).toBe('error_rate_high');
        expect(parsed.level).toBe('alert');
    });

    it('handles resolved events', () => {
        const resolved: AlertEvent = {
            ...baseEvent,
            resolved: true,
            details: { note: 'error rate returned to normal' },
        };
        const log = formatAlertLog(resolved);
        expect(log.resolved).toBe(true);
        expect(log.details.note).toBe('error rate returned to normal');
    });

    it('handles empty details', () => {
        const event: AlertEvent = { ...baseEvent, details: {} };
        const log = formatAlertLog(event);
        expect(log.details).toEqual({});
    });

    it('supports all severity levels', () => {
        const severities: AlertSeverity[] = ['critical', 'warning', 'info'];
        for (const severity of severities) {
            const event: AlertEvent = {
                ...baseEvent,
                rule: { ...baseEvent.rule, severity },
            };
            expect(formatAlertLog(event).severity).toBe(severity);
        }
    });
});
