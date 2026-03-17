import { describe, expect, it } from 'vitest';
import type {
    AvailabilityWindow,
    NoShowEvent,
    Shift,
    ShiftConflict,
    ShiftReminder,
} from '@patchwork/shared';
import {
    toAvailabilityWindowCard,
    toConflictWarning,
    toNoShowAlert,
    toReminderViewModel,
    toSchedulingDashboard,
    toShiftCard,
} from './scheduling-ux.js';

const NOW = '2026-03-01T12:00:00.000Z';
const VOL_DID = 'did:example:volunteer1';
const POST_URI = 'at://did:example:alice/app.patchwork.aid.post/post-123';

const makeWindow = (overrides: Partial<AvailabilityWindow> = {}): AvailabilityWindow => ({
    id: 'avail-1',
    volunteerDid: VOL_DID,
    startTime: '09:00',
    endTime: '17:00',
    timezone: 'UTC',
    recurrence: { pattern: 'weekly', daysOfWeek: ['monday', 'wednesday', 'friday'] },
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
});

const makeShift = (overrides: Partial<Shift> = {}): Shift => ({
    id: 'shift-1',
    volunteerDid: VOL_DID,
    requestPostUri: POST_URI,
    startTime: '2026-03-02T09:00:00.000Z',
    endTime: '2026-03-02T11:00:00.000Z',
    timezone: 'UTC',
    status: 'scheduled',
    assignedBy: 'did:example:coordinator1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
});

const makeReminder = (overrides: Partial<ShiftReminder> = {}): ShiftReminder => ({
    id: 'reminder-1',
    shiftId: 'shift-1',
    volunteerDid: VOL_DID,
    leadTime: '1_hour',
    scheduledAt: '2026-03-02T08:00:00.000Z',
    status: 'pending',
    createdAt: NOW,
    ...overrides,
});

// ---------------------------------------------------------------------------
// Availability window card
// ---------------------------------------------------------------------------

describe('toAvailabilityWindowCard', () => {
    it('maps availability window to card view model', () => {
        const card = toAvailabilityWindowCard(makeWindow());
        expect(card.id).toBe('avail-1');
        expect(card.timeRange).toBe('09:00 - 17:00');
        expect(card.recurrenceLabel).toBe('Weekly');
        expect(card.daysLabel).toBe('Mon, Wed, Fri');
        expect(card.active).toBe(true);
    });

    it('shows "All days" when no specific days', () => {
        const card = toAvailabilityWindowCard(makeWindow({
            recurrence: { pattern: 'daily' },
        }));
        expect(card.recurrenceLabel).toBe('Daily');
        expect(card.daysLabel).toBe('All days');
    });

    it('maps monthly recurrence', () => {
        const card = toAvailabilityWindowCard(makeWindow({
            recurrence: { pattern: 'monthly', dayOfMonth: 15 },
        }));
        expect(card.recurrenceLabel).toBe('Monthly');
    });
});

// ---------------------------------------------------------------------------
// Shift card
// ---------------------------------------------------------------------------

describe('toShiftCard', () => {
    it('maps shift to card view model', () => {
        const card = toShiftCard(makeShift());
        expect(card.id).toBe('shift-1');
        expect(card.dateLabel).toBe('Mar 2, 2026');
        expect(card.timeRange).toBe('09:00 - 11:00');
        expect(card.statusBadge.label).toBe('Scheduled');
        expect(card.statusBadge.tone).toBe('info');
        expect(card.canConfirm).toBe(true);
        expect(card.canStart).toBe(false);
        expect(card.canComplete).toBe(false);
        expect(card.canCancel).toBe(true);
    });

    it('shows correct actions for confirmed shift', () => {
        const card = toShiftCard(makeShift({ status: 'confirmed' }));
        expect(card.statusBadge.label).toBe('Confirmed');
        expect(card.canConfirm).toBe(false);
        expect(card.canStart).toBe(true);
        expect(card.canCancel).toBe(true);
    });

    it('shows correct actions for in_progress shift', () => {
        const card = toShiftCard(makeShift({ status: 'in_progress' }));
        expect(card.canComplete).toBe(true);
        expect(card.canCancel).toBe(true);
    });

    it('shows no actions for completed shift', () => {
        const card = toShiftCard(makeShift({ status: 'completed' }));
        expect(card.statusBadge.tone).toBe('success');
        expect(card.canConfirm).toBe(false);
        expect(card.canStart).toBe(false);
        expect(card.canComplete).toBe(false);
        expect(card.canCancel).toBe(false);
    });

    it('shows missed status', () => {
        const card = toShiftCard(makeShift({ status: 'missed' }));
        expect(card.statusBadge.label).toBe('Missed');
        expect(card.statusBadge.tone).toBe('danger');
    });

    it('indicates conflict when present', () => {
        const conflict: ShiftConflict = {
            shiftId: 'shift-1',
            conflictingShiftId: 'shift-2',
            overlapStart: '2026-03-02T10:00:00Z',
            overlapEnd: '2026-03-02T11:00:00Z',
            volunteerDid: VOL_DID,
        };

        const card = toShiftCard(makeShift(), [conflict]);
        expect(card.hasConflict).toBe(true);
    });

    it('no conflict when list is empty', () => {
        const card = toShiftCard(makeShift(), []);
        expect(card.hasConflict).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Reminder view model
// ---------------------------------------------------------------------------

describe('toReminderViewModel', () => {
    it('maps reminder to view model', () => {
        const vm = toReminderViewModel(makeReminder());
        expect(vm.id).toBe('reminder-1');
        expect(vm.leadTimeLabel).toBe('1 hour before');
        expect(vm.status).toBe('pending');
        expect(vm.statusTone).toBe('neutral');
    });

    it('maps sent status', () => {
        const vm = toReminderViewModel(makeReminder({ status: 'sent' }));
        expect(vm.statusTone).toBe('info');
    });

    it('maps acknowledged status', () => {
        const vm = toReminderViewModel(makeReminder({ status: 'acknowledged' }));
        expect(vm.statusTone).toBe('success');
    });

    it('maps failed status', () => {
        const vm = toReminderViewModel(makeReminder({ status: 'failed' }));
        expect(vm.statusTone).toBe('danger');
    });
});

// ---------------------------------------------------------------------------
// Conflict warning
// ---------------------------------------------------------------------------

describe('toConflictWarning', () => {
    it('maps conflict to warning view model', () => {
        const conflict: ShiftConflict = {
            shiftId: 'shift-1',
            conflictingShiftId: 'shift-2',
            overlapStart: '2026-03-02T10:00:00.000Z',
            overlapEnd: '2026-03-02T11:00:00.000Z',
            volunteerDid: VOL_DID,
        };

        const warning = toConflictWarning(conflict);
        expect(warning.shiftId).toBe('shift-1');
        expect(warning.conflictingShiftId).toBe('shift-2');
        expect(warning.overlapDescription).toContain('10:00 - 11:00');
    });
});

// ---------------------------------------------------------------------------
// No-show alert
// ---------------------------------------------------------------------------

describe('toNoShowAlert', () => {
    it('maps no-show event to alert view model', () => {
        const event: NoShowEvent = {
            shiftId: 'shift-1',
            volunteerDid: VOL_DID,
            requestPostUri: POST_URI,
            detectedAt: '2026-03-02T09:20:00Z',
            fallbackAction: 'notify_coordinator',
        };

        const alert = toNoShowAlert(event);
        expect(alert.shiftId).toBe('shift-1');
        expect(alert.tone).toBe('danger');
        expect(alert.fallbackLabel).toBe('Notify coordinator');
    });

    it('shows reassign fallback label', () => {
        const event: NoShowEvent = {
            shiftId: 'shift-1',
            volunteerDid: VOL_DID,
            requestPostUri: POST_URI,
            detectedAt: '2026-03-02T09:20:00Z',
            fallbackAction: 'reassign',
        };

        const alert = toNoShowAlert(event);
        expect(alert.fallbackLabel).toBe('Reassign to another volunteer');
    });
});

// ---------------------------------------------------------------------------
// Scheduling dashboard
// ---------------------------------------------------------------------------

describe('toSchedulingDashboard', () => {
    it('builds dashboard with availability windows and shifts', () => {
        const dashboard = toSchedulingDashboard({
            windows: [makeWindow()],
            shifts: [
                makeShift({ id: 'shift-1', startTime: '2026-03-02T09:00:00.000Z', endTime: '2026-03-02T11:00:00.000Z' }),
            ],
            reminders: [makeReminder()],
            conflicts: [],
            noShowEvents: [],
            now: NOW,
        });

        expect(dashboard.availabilityWindows).toHaveLength(1);
        expect(dashboard.upcomingShifts).toHaveLength(1);
        expect(dashboard.pastShifts).toHaveLength(0);
        expect(dashboard.reminders).toHaveLength(1);
        expect(dashboard.isEmpty).toBe(false);
    });

    it('separates upcoming and past shifts', () => {
        const dashboard = toSchedulingDashboard({
            windows: [],
            shifts: [
                makeShift({ id: 'shift-future', startTime: '2026-03-02T09:00:00.000Z', endTime: '2026-03-02T11:00:00.000Z' }),
                makeShift({ id: 'shift-past', startTime: '2026-02-28T09:00:00.000Z', endTime: '2026-02-28T11:00:00.000Z', status: 'completed' }),
            ],
            reminders: [],
            conflicts: [],
            noShowEvents: [],
            now: NOW,
        });

        expect(dashboard.upcomingShifts).toHaveLength(1);
        expect(dashboard.upcomingShifts[0]!.id).toBe('shift-future');
        expect(dashboard.pastShifts).toHaveLength(1);
        expect(dashboard.pastShifts[0]!.id).toBe('shift-past');
    });

    it('shows empty state when no data', () => {
        const dashboard = toSchedulingDashboard({
            windows: [],
            shifts: [],
            reminders: [],
            conflicts: [],
            noShowEvents: [],
            now: NOW,
        });

        expect(dashboard.isEmpty).toBe(true);
    });

    it('includes conflict warnings and no-show alerts', () => {
        const conflict: ShiftConflict = {
            shiftId: 'shift-1',
            conflictingShiftId: 'shift-2',
            overlapStart: '2026-03-02T10:00:00Z',
            overlapEnd: '2026-03-02T11:00:00Z',
            volunteerDid: VOL_DID,
        };

        const noShow: NoShowEvent = {
            shiftId: 'shift-3',
            volunteerDid: VOL_DID,
            requestPostUri: POST_URI,
            detectedAt: '2026-03-02T09:20:00Z',
            fallbackAction: 'escalate',
        };

        const dashboard = toSchedulingDashboard({
            windows: [],
            shifts: [makeShift()],
            reminders: [],
            conflicts: [conflict],
            noShowEvents: [noShow],
            now: NOW,
        });

        expect(dashboard.conflictWarnings).toHaveLength(1);
        expect(dashboard.noShowAlerts).toHaveLength(1);
        expect(dashboard.noShowAlerts[0]!.fallbackLabel).toBe('Escalate to coordinator');
    });
});
