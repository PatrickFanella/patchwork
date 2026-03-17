import { describe, expect, it } from 'vitest';
import {
    DAYS_OF_WEEK,
    RECURRENCE_PATTERNS,
    SHIFT_STATUSES,
    REMINDER_LEAD_TIMES,
    REMINDER_LEAD_TIME_MS,
    FALLBACK_ACTIONS,
    NO_SHOW_GRACE_MS,
    SHIFT_TRANSITION_GRAPH,
    hasTimeOverlap,
    detectConflicts,
    isNoShow,
    isValidShiftTransition,
    parseTimeToMinutes,
    isWithinTimeRange,
    type Shift,
    type ShiftStatus,
} from './scheduling.js';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

describe('scheduling enumerations', () => {
    it('defines days of week', () => {
        expect(DAYS_OF_WEEK).toHaveLength(7);
        expect(DAYS_OF_WEEK).toContain('monday');
        expect(DAYS_OF_WEEK).toContain('sunday');
    });

    it('defines recurrence patterns', () => {
        expect(RECURRENCE_PATTERNS).toContain('once');
        expect(RECURRENCE_PATTERNS).toContain('weekly');
        expect(RECURRENCE_PATTERNS).toContain('monthly');
    });

    it('defines shift statuses', () => {
        expect(SHIFT_STATUSES).toContain('scheduled');
        expect(SHIFT_STATUSES).toContain('completed');
        expect(SHIFT_STATUSES).toContain('missed');
    });

    it('defines reminder lead times', () => {
        expect(REMINDER_LEAD_TIMES).toContain('15_minutes');
        expect(REMINDER_LEAD_TIMES).toContain('1_day');
    });

    it('defines reminder lead time values in ms', () => {
        expect(REMINDER_LEAD_TIME_MS['15_minutes']).toBe(15 * 60 * 1000);
        expect(REMINDER_LEAD_TIME_MS['1_hour']).toBe(60 * 60 * 1000);
        expect(REMINDER_LEAD_TIME_MS['1_day']).toBe(24 * 60 * 60 * 1000);
    });

    it('defines fallback actions', () => {
        expect(FALLBACK_ACTIONS).toContain('reassign');
        expect(FALLBACK_ACTIONS).toContain('escalate');
        expect(FALLBACK_ACTIONS).toContain('cancel_shift');
    });
});

// ---------------------------------------------------------------------------
// Time overlap detection
// ---------------------------------------------------------------------------

describe('hasTimeOverlap', () => {
    it('detects overlapping ranges', () => {
        expect(hasTimeOverlap(
            '2026-03-01T09:00:00Z',
            '2026-03-01T11:00:00Z',
            '2026-03-01T10:00:00Z',
            '2026-03-01T12:00:00Z',
        )).toBe(true);
    });

    it('detects contained range', () => {
        expect(hasTimeOverlap(
            '2026-03-01T09:00:00Z',
            '2026-03-01T15:00:00Z',
            '2026-03-01T10:00:00Z',
            '2026-03-01T12:00:00Z',
        )).toBe(true);
    });

    it('returns false for non-overlapping ranges', () => {
        expect(hasTimeOverlap(
            '2026-03-01T09:00:00Z',
            '2026-03-01T10:00:00Z',
            '2026-03-01T10:00:00Z',
            '2026-03-01T11:00:00Z',
        )).toBe(false);
    });

    it('returns false for adjacent ranges', () => {
        expect(hasTimeOverlap(
            '2026-03-01T08:00:00Z',
            '2026-03-01T09:00:00Z',
            '2026-03-01T09:00:00Z',
            '2026-03-01T10:00:00Z',
        )).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

describe('detectConflicts', () => {
    const makeShift = (overrides: Partial<Shift>): Pick<Shift, 'id' | 'volunteerDid' | 'startTime' | 'endTime'> => ({
        id: 'shift-1',
        volunteerDid: 'did:example:vol1',
        startTime: '2026-03-01T09:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
        ...overrides,
    });

    it('detects conflict between overlapping shifts for same volunteer', () => {
        const candidate = makeShift({ id: 'shift-new', startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T12:00:00Z' });
        const existing = [makeShift({ id: 'shift-1' })];

        const conflicts = detectConflicts(candidate, existing);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]!.shiftId).toBe('shift-new');
        expect(conflicts[0]!.conflictingShiftId).toBe('shift-1');
    });

    it('returns no conflicts for different volunteers', () => {
        const candidate = makeShift({ id: 'shift-new', volunteerDid: 'did:example:vol2' });
        const existing = [makeShift({ id: 'shift-1', volunteerDid: 'did:example:vol1' })];

        const conflicts = detectConflicts(candidate, existing);
        expect(conflicts).toHaveLength(0);
    });

    it('returns no conflicts for non-overlapping shifts', () => {
        const candidate = makeShift({ id: 'shift-new', startTime: '2026-03-01T12:00:00Z', endTime: '2026-03-01T14:00:00Z' });
        const existing = [makeShift({ id: 'shift-1' })];

        const conflicts = detectConflicts(candidate, existing);
        expect(conflicts).toHaveLength(0);
    });

    it('skips self-comparison', () => {
        const candidate = makeShift({ id: 'shift-1' });
        const existing = [makeShift({ id: 'shift-1' })];

        const conflicts = detectConflicts(candidate, existing);
        expect(conflicts).toHaveLength(0);
    });

    it('detects multiple conflicts', () => {
        const candidate = makeShift({ id: 'shift-new', startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T16:00:00Z' });
        const existing = [
            makeShift({ id: 'shift-1', startTime: '2026-03-01T09:00:00Z', endTime: '2026-03-01T11:00:00Z' }),
            makeShift({ id: 'shift-2', startTime: '2026-03-01T14:00:00Z', endTime: '2026-03-01T17:00:00Z' }),
        ];

        const conflicts = detectConflicts(candidate, existing);
        expect(conflicts).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// No-show detection
// ---------------------------------------------------------------------------

describe('isNoShow', () => {
    it('flags a scheduled shift past grace period as no-show', () => {
        const shift = { startTime: '2026-03-01T09:00:00Z', status: 'scheduled' as ShiftStatus };
        // 20 minutes after start
        expect(isNoShow(shift, '2026-03-01T09:20:00Z')).toBe(true);
    });

    it('does not flag within grace period', () => {
        const shift = { startTime: '2026-03-01T09:00:00Z', status: 'scheduled' as ShiftStatus };
        // 10 minutes after start (within 15-minute grace)
        expect(isNoShow(shift, '2026-03-01T09:10:00Z')).toBe(false);
    });

    it('does not flag in_progress shifts', () => {
        const shift = { startTime: '2026-03-01T09:00:00Z', status: 'in_progress' as ShiftStatus };
        expect(isNoShow(shift, '2026-03-01T09:20:00Z')).toBe(false);
    });

    it('does not flag completed shifts', () => {
        const shift = { startTime: '2026-03-01T09:00:00Z', status: 'completed' as ShiftStatus };
        expect(isNoShow(shift, '2026-03-01T09:20:00Z')).toBe(false);
    });

    it('flags confirmed shift past grace period', () => {
        const shift = { startTime: '2026-03-01T09:00:00Z', status: 'confirmed' as ShiftStatus };
        expect(isNoShow(shift, '2026-03-01T09:20:00Z')).toBe(true);
    });

    it('has 15-minute grace period', () => {
        expect(NO_SHOW_GRACE_MS).toBe(15 * 60 * 1000);
    });
});

// ---------------------------------------------------------------------------
// Shift transition rules
// ---------------------------------------------------------------------------

describe('shift transitions', () => {
    it('allows scheduled -> confirmed', () => {
        expect(isValidShiftTransition('scheduled', 'confirmed')).toBe(true);
    });

    it('allows confirmed -> in_progress', () => {
        expect(isValidShiftTransition('confirmed', 'in_progress')).toBe(true);
    });

    it('allows in_progress -> completed', () => {
        expect(isValidShiftTransition('in_progress', 'completed')).toBe(true);
    });

    it('allows scheduled -> cancelled', () => {
        expect(isValidShiftTransition('scheduled', 'cancelled')).toBe(true);
    });

    it('allows scheduled -> missed (no-show)', () => {
        expect(isValidShiftTransition('scheduled', 'missed')).toBe(true);
    });

    it('rejects completed -> scheduled', () => {
        expect(isValidShiftTransition('completed', 'scheduled')).toBe(false);
    });

    it('rejects missed -> in_progress', () => {
        expect(isValidShiftTransition('missed', 'in_progress')).toBe(false);
    });

    it('allows self-transitions', () => {
        for (const status of SHIFT_STATUSES) {
            expect(isValidShiftTransition(status, status)).toBe(true);
        }
    });

    it('completed, missed, and cancelled are terminal states', () => {
        expect(SHIFT_TRANSITION_GRAPH.completed).toEqual([]);
        expect(SHIFT_TRANSITION_GRAPH.missed).toEqual([]);
        expect(SHIFT_TRANSITION_GRAPH.cancelled).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Time parsing helpers
// ---------------------------------------------------------------------------

describe('parseTimeToMinutes', () => {
    it('parses midnight', () => {
        expect(parseTimeToMinutes('00:00')).toBe(0);
    });

    it('parses noon', () => {
        expect(parseTimeToMinutes('12:00')).toBe(720);
    });

    it('parses evening time', () => {
        expect(parseTimeToMinutes('22:30')).toBe(22 * 60 + 30);
    });
});

describe('isWithinTimeRange', () => {
    it('returns true for time within normal range', () => {
        expect(isWithinTimeRange('10:00', '09:00', '17:00')).toBe(true);
    });

    it('returns true for start boundary', () => {
        expect(isWithinTimeRange('09:00', '09:00', '17:00')).toBe(true);
    });

    it('returns false for end boundary (exclusive)', () => {
        expect(isWithinTimeRange('17:00', '09:00', '17:00')).toBe(false);
    });

    it('returns false for time outside range', () => {
        expect(isWithinTimeRange('08:00', '09:00', '17:00')).toBe(false);
    });

    it('handles overnight windows', () => {
        // 22:00 - 06:00 overnight
        expect(isWithinTimeRange('23:00', '22:00', '06:00')).toBe(true);
        expect(isWithinTimeRange('03:00', '22:00', '06:00')).toBe(true);
        expect(isWithinTimeRange('10:00', '22:00', '06:00')).toBe(false);
    });
});
