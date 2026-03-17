import { describe, expect, it, beforeEach } from 'vitest';
import { SchedulingService } from './scheduling-service.js';

const VOL_DID = 'did:example:volunteer1';
const COORD_DID = 'did:example:coordinator1';
const POST_URI = 'at://did:example:alice/app.patchwork.aid.post/post-123';
const NOW = '2026-03-01T12:00:00.000Z';

const toParams = (obj: Record<string, string>): URLSearchParams =>
    new URLSearchParams(obj);

describe('SchedulingService', () => {
    let service: SchedulingService;

    beforeEach(() => {
        service = new SchedulingService();
    });

    // -------------------------------------------------------------------
    // Availability windows
    // -------------------------------------------------------------------

    describe('availability windows', () => {
        it('adds an availability window', () => {
            const window = service.addAvailabilityWindow({
                volunteerDid: VOL_DID,
                startTime: '09:00',
                endTime: '17:00',
                recurrence: { pattern: 'weekly', daysOfWeek: ['monday', 'wednesday', 'friday'] },
                now: NOW,
            });

            expect(window.id).toBeTruthy();
            expect(window.volunteerDid).toBe(VOL_DID);
            expect(window.startTime).toBe('09:00');
            expect(window.recurrence.pattern).toBe('weekly');
            expect(window.active).toBe(true);
        });

        it('retrieves active windows for a volunteer', () => {
            service.addAvailabilityWindow({
                volunteerDid: VOL_DID,
                startTime: '09:00',
                endTime: '12:00',
                recurrence: { pattern: 'daily' },
                now: NOW,
            });
            service.addAvailabilityWindow({
                volunteerDid: VOL_DID,
                startTime: '14:00',
                endTime: '18:00',
                recurrence: { pattern: 'weekly', daysOfWeek: ['tuesday'] },
                now: NOW,
            });

            const windows = service.getAvailabilityWindows(VOL_DID);
            expect(windows).toHaveLength(2);
        });

        it('updates an availability window', () => {
            const window = service.addAvailabilityWindow({
                volunteerDid: VOL_DID,
                startTime: '09:00',
                endTime: '17:00',
                recurrence: { pattern: 'weekly' },
                now: NOW,
            });

            const updated = service.updateAvailabilityWindow(VOL_DID, window.id, {
                startTime: '10:00',
                endTime: '16:00',
            });

            expect(updated).not.toBeNull();
            expect(updated!.startTime).toBe('10:00');
            expect(updated!.endTime).toBe('16:00');
        });

        it('removes (deactivates) an availability window', () => {
            const window = service.addAvailabilityWindow({
                volunteerDid: VOL_DID,
                startTime: '09:00',
                endTime: '17:00',
                recurrence: { pattern: 'weekly' },
                now: NOW,
            });

            expect(service.removeAvailabilityWindow(VOL_DID, window.id)).toBe(true);
            expect(service.getAvailabilityWindows(VOL_DID)).toHaveLength(0);
        });

        it('returns empty list for unknown volunteer', () => {
            expect(service.getAvailabilityWindows('did:example:unknown')).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------
    // Shift assignment
    // -------------------------------------------------------------------

    describe('shift assignment', () => {
        it('assigns a shift and creates reminders', () => {
            const result = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                reminderLeadTimes: ['1_hour', '15_minutes'],
                now: NOW,
            });

            expect(result.shift.id).toBeTruthy();
            expect(result.shift.status).toBe('scheduled');
            expect(result.shift.volunteerDid).toBe(VOL_DID);
            expect(result.conflicts).toHaveLength(0);
            expect(result.reminders).toHaveLength(2);
        });

        it('links shift to availability window', () => {
            const window = service.addAvailabilityWindow({
                volunteerDid: VOL_DID,
                startTime: '09:00',
                endTime: '17:00',
                recurrence: { pattern: 'daily' },
                now: NOW,
            });

            const result = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                availabilityWindowId: window.id,
                now: NOW,
            });

            expect(result.shift.availabilityWindowId).toBe(window.id);
        });

        it('detects conflicts with existing shifts', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const result = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: 'at://did:example:bob/app.patchwork.aid.post/post-456',
                startTime: '2026-03-02T10:00:00Z',
                endTime: '2026-03-02T12:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            expect(result.conflicts).toHaveLength(1);
            // Shift is still created despite conflict (soft warning)
            expect(result.shift.id).toBeTruthy();
        });

        it('retrieves shifts by volunteer', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const shifts = service.getVolunteerShifts(VOL_DID);
            expect(shifts).toHaveLength(1);
        });

        it('retrieves shifts by request', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const shifts = service.getRequestShifts(POST_URI);
            expect(shifts).toHaveLength(1);
        });
    });

    // -------------------------------------------------------------------
    // Shift transitions
    // -------------------------------------------------------------------

    describe('shift transitions', () => {
        it('transitions scheduled -> confirmed', () => {
            const { shift } = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const result = service.transitionShift(shift.id, 'confirmed');
            expect(result.statusCode).toBe(200);
            expect(result.shift!.status).toBe('confirmed');
        });

        it('transitions confirmed -> in_progress -> completed', () => {
            const { shift } = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            service.transitionShift(shift.id, 'confirmed');
            service.transitionShift(shift.id, 'in_progress');
            const result = service.transitionShift(shift.id, 'completed');
            expect(result.statusCode).toBe(200);
            expect(result.shift!.status).toBe('completed');
        });

        it('rejects invalid transitions', () => {
            const { shift } = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            // Cannot go directly from scheduled to completed
            const result = service.transitionShift(shift.id, 'completed');
            expect(result.statusCode).toBe(403);
            expect(result.error).toBeTruthy();
        });

        it('allows cancellation from any active state', () => {
            const { shift } = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const result = service.transitionShift(shift.id, 'cancelled');
            expect(result.statusCode).toBe(200);
            expect(result.shift!.status).toBe('cancelled');
        });

        it('returns 404 for unknown shift', () => {
            const result = service.transitionShift('shift-999', 'confirmed');
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Reminders
    // -------------------------------------------------------------------

    describe('reminders', () => {
        it('creates reminders with correct scheduled times', () => {
            const { reminders } = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T10:00:00.000Z',
                endTime: '2026-03-02T12:00:00.000Z',
                assignedBy: COORD_DID,
                reminderLeadTimes: ['1_hour'],
                now: NOW,
            });

            expect(reminders).toHaveLength(1);
            expect(reminders[0]!.leadTime).toBe('1_hour');
            // 1 hour before 10:00 = 09:00
            expect(reminders[0]!.scheduledAt).toBe('2026-03-02T09:00:00.000Z');
            expect(reminders[0]!.status).toBe('pending');
        });

        it('processes due reminders', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T10:00:00.000Z',
                endTime: '2026-03-02T12:00:00.000Z',
                assignedBy: COORD_DID,
                reminderLeadTimes: ['1_hour'],
                now: NOW,
            });

            // Before reminder time
            const before = service.processDueReminders('2026-03-02T08:00:00.000Z');
            expect(before).toHaveLength(0);

            // After reminder time
            const after = service.processDueReminders('2026-03-02T09:30:00.000Z');
            expect(after).toHaveLength(1);
            expect(after[0]!.status).toBe('sent');
        });

        it('does not re-send already sent reminders', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T10:00:00.000Z',
                endTime: '2026-03-02T12:00:00.000Z',
                assignedBy: COORD_DID,
                reminderLeadTimes: ['1_hour'],
                now: NOW,
            });

            service.processDueReminders('2026-03-02T09:30:00.000Z');
            const second = service.processDueReminders('2026-03-02T09:45:00.000Z');
            expect(second).toHaveLength(0);
        });

        it('acknowledges a sent reminder', () => {
            const { reminders } = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T10:00:00.000Z',
                endTime: '2026-03-02T12:00:00.000Z',
                assignedBy: COORD_DID,
                reminderLeadTimes: ['1_hour'],
                now: NOW,
            });

            service.processDueReminders('2026-03-02T09:30:00.000Z');
            expect(service.acknowledgeReminder(reminders[0]!.id)).toBe(true);
        });
    });

    // -------------------------------------------------------------------
    // No-show detection
    // -------------------------------------------------------------------

    describe('no-show handling', () => {
        it('detects a no-show after grace period', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            // 20 minutes after shift start (past 15-min grace)
            const events = service.checkNoShows('2026-03-02T09:20:00Z');
            expect(events).toHaveLength(1);
            expect(events[0]!.volunteerDid).toBe(VOL_DID);
            expect(events[0]!.fallbackAction).toBe('notify_coordinator');
        });

        it('does not flag within grace period', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const events = service.checkNoShows('2026-03-02T09:10:00Z');
            expect(events).toHaveLength(0);
        });

        it('does not flag in_progress shifts', () => {
            const { shift } = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            service.transitionShift(shift.id, 'confirmed');
            service.transitionShift(shift.id, 'in_progress');

            const events = service.checkNoShows('2026-03-02T09:20:00Z');
            expect(events).toHaveLength(0);
        });

        it('marks missed shift and records no-show event', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            service.checkNoShows('2026-03-02T09:20:00Z');

            const allEvents = service.getNoShowEvents();
            expect(allEvents).toHaveLength(1);

            // Shift should now be 'missed'
            const shifts = service.getVolunteerShifts(VOL_DID);
            expect(shifts[0]!.status).toBe('missed');
        });

        it('supports custom fallback actions', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const events = service.checkNoShows('2026-03-02T09:20:00Z', 'escalate');
            expect(events[0]!.fallbackAction).toBe('escalate');
        });
    });

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    describe('route handlers', () => {
        it('addAvailabilityFromParams adds a window', () => {
            const result = service.addAvailabilityFromParams({
                volunteerDid: VOL_DID,
                startTime: '09:00',
                endTime: '17:00',
                recurrence: { pattern: 'weekly' },
                now: NOW,
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as { id: string };
            expect(body.id).toBeTruthy();
        });

        it('addAvailabilityFromParams returns 400 without required fields', () => {
            const result = service.addAvailabilityFromParams({});
            expect(result.statusCode).toBe(400);
        });

        it('getAvailabilityFromParams returns windows', () => {
            service.addAvailabilityWindow({
                volunteerDid: VOL_DID,
                startTime: '09:00',
                endTime: '17:00',
                recurrence: { pattern: 'daily' },
                now: NOW,
            });

            const result = service.getAvailabilityFromParams(toParams({ volunteerDid: VOL_DID }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { windows: unknown[] };
            expect(body.windows).toHaveLength(1);
        });

        it('assignShiftFromParams assigns a shift', () => {
            const result = service.assignShiftFromParams({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            expect(result.statusCode).toBe(200);
            const body = result.body as { shift: { id: string } };
            expect(body.shift.id).toBeTruthy();
        });

        it('assignShiftFromParams returns 400 without required fields', () => {
            const result = service.assignShiftFromParams({});
            expect(result.statusCode).toBe(400);
        });

        it('getVolunteerShiftsFromParams returns shifts', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const result = service.getVolunteerShiftsFromParams(toParams({ volunteerDid: VOL_DID }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { shifts: unknown[] };
            expect(body.shifts).toHaveLength(1);
        });

        it('transitionShiftFromParams transitions a shift', () => {
            const { shift } = service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const result = service.transitionShiftFromParams({
                shiftId: shift.id,
                targetStatus: 'confirmed',
            });

            expect(result.statusCode).toBe(200);
        });

        it('checkNoShowsFromParams checks for no-shows', () => {
            service.assignShift({
                volunteerDid: VOL_DID,
                requestPostUri: POST_URI,
                startTime: '2026-03-02T09:00:00Z',
                endTime: '2026-03-02T11:00:00Z',
                assignedBy: COORD_DID,
                now: NOW,
            });

            const result = service.checkNoShowsFromParams({ now: '2026-03-02T09:20:00Z' });
            expect(result.statusCode).toBe(200);
            const body = result.body as { events: unknown[]; total: number };
            expect(body.total).toBe(1);
        });

        it('checkNoShowsFromParams returns 400 without now', () => {
            const result = service.checkNoShowsFromParams({});
            expect(result.statusCode).toBe(400);
        });
    });
});
