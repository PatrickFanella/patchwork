import type {
    AvailabilityWindow,
    FallbackAction,
    NoShowEvent,
    RecurrenceRule,
    ReminderLeadTime,
    Shift,
    ShiftConflict,
    ShiftReminder,
    ShiftStatus,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Local implementations (avoids cross-workspace runtime import issues)
// ---------------------------------------------------------------------------

const NO_SHOW_GRACE_MS = 15 * 60 * 1000;

const REMINDER_LEAD_TIME_MS: Record<string, number> = {
    '15_minutes': 15 * 60 * 1000,
    '30_minutes': 30 * 60 * 1000,
    '1_hour': 60 * 60 * 1000,
    '2_hours': 2 * 60 * 60 * 1000,
    '1_day': 24 * 60 * 60 * 1000,
};

const SHIFT_TRANSITION_GRAPH: Record<string, readonly string[]> = {
    scheduled: ['confirmed', 'cancelled', 'missed'],
    confirmed: ['in_progress', 'cancelled', 'missed'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    missed: [],
    cancelled: [],
};

const isValidShiftTransition = (from: string, to: string): boolean => {
    if (from === to) return true;
    return (SHIFT_TRANSITION_GRAPH[from] ?? []).includes(to);
};

const hasTimeOverlap = (
    startA: string, endA: string,
    startB: string, endB: string,
): boolean => {
    const a0 = new Date(startA).getTime();
    const a1 = new Date(endA).getTime();
    const b0 = new Date(startB).getTime();
    const b1 = new Date(endB).getTime();
    return a0 < b1 && b0 < a1;
};

const detectConflicts = (
    candidate: Pick<Shift, 'id' | 'volunteerDid' | 'startTime' | 'endTime'>,
    existingShifts: ReadonlyArray<Pick<Shift, 'id' | 'volunteerDid' | 'startTime' | 'endTime'>>,
): ShiftConflict[] => {
    const conflicts: ShiftConflict[] = [];
    for (const existing of existingShifts) {
        if (existing.volunteerDid !== candidate.volunteerDid) continue;
        if (existing.id === candidate.id) continue;
        if (hasTimeOverlap(candidate.startTime, candidate.endTime, existing.startTime, existing.endTime)) {
            const overlapStart = new Date(Math.max(
                new Date(candidate.startTime).getTime(),
                new Date(existing.startTime).getTime(),
            )).toISOString();
            const overlapEnd = new Date(Math.min(
                new Date(candidate.endTime).getTime(),
                new Date(existing.endTime).getTime(),
            )).toISOString();
            conflicts.push({
                shiftId: candidate.id,
                conflictingShiftId: existing.id,
                overlapStart,
                overlapEnd,
                volunteerDid: candidate.volunteerDid,
            });
        }
    }
    return conflicts;
};

const isNoShow = (
    shift: Pick<Shift, 'startTime' | 'status'>,
    now: string,
): boolean => {
    if (shift.status !== 'scheduled' && shift.status !== 'confirmed') return false;
    const shiftStart = new Date(shift.startTime).getTime();
    const currentTime = new Date(now).getTime();
    return currentTime > shiftStart + NO_SHOW_GRACE_MS;
};

// ---------------------------------------------------------------------------
// Route result type
// ---------------------------------------------------------------------------

export interface SchedulingRouteResult {
    statusCode: number;
    body: unknown;
}

// ---------------------------------------------------------------------------
// Scheduling service
// ---------------------------------------------------------------------------

export class SchedulingService {
    private readonly availabilityWindows = new Map<string, AvailabilityWindow[]>();
    private readonly shifts = new Map<string, Shift>();
    private readonly reminders = new Map<string, ShiftReminder[]>();
    private readonly noShowEvents: NoShowEvent[] = [];
    private idCounter = 0;

    // -------------------------------------------------------------------
    // Availability window management
    // -------------------------------------------------------------------

    /**
     * Publish a recurring availability window for a volunteer.
     */
    addAvailabilityWindow(input: {
        volunteerDid: string;
        startTime: string;
        endTime: string;
        timezone?: string;
        recurrence: RecurrenceRule;
        now?: string;
    }): AvailabilityWindow {
        const now = input.now ?? new Date().toISOString();
        this.idCounter += 1;

        const window: AvailabilityWindow = {
            id: `avail-${this.idCounter}`,
            volunteerDid: input.volunteerDid,
            startTime: input.startTime,
            endTime: input.endTime,
            timezone: input.timezone ?? 'UTC',
            recurrence: { ...input.recurrence },
            active: true,
            createdAt: now,
            updatedAt: now,
        };

        const windows = this.availabilityWindows.get(input.volunteerDid) ?? [];
        windows.push(window);
        this.availabilityWindows.set(input.volunteerDid, windows);

        return window;
    }

    getAvailabilityWindows(volunteerDid: string): AvailabilityWindow[] {
        return (this.availabilityWindows.get(volunteerDid) ?? [])
            .filter(w => w.active);
    }

    updateAvailabilityWindow(
        volunteerDid: string,
        windowId: string,
        update: Partial<Pick<AvailabilityWindow, 'startTime' | 'endTime' | 'recurrence' | 'active'>>,
    ): AvailabilityWindow | null {
        const windows = this.availabilityWindows.get(volunteerDid);
        if (!windows) return null;

        const window = windows.find(w => w.id === windowId);
        if (!window) return null;

        if (update.startTime !== undefined) window.startTime = update.startTime;
        if (update.endTime !== undefined) window.endTime = update.endTime;
        if (update.recurrence !== undefined) window.recurrence = { ...update.recurrence };
        if (update.active !== undefined) window.active = update.active;
        window.updatedAt = new Date().toISOString();

        return { ...window };
    }

    removeAvailabilityWindow(volunteerDid: string, windowId: string): boolean {
        const windows = this.availabilityWindows.get(volunteerDid);
        if (!windows) return false;

        const window = windows.find(w => w.id === windowId);
        if (!window) return false;

        window.active = false;
        window.updatedAt = new Date().toISOString();
        return true;
    }

    // -------------------------------------------------------------------
    // Shift management
    // -------------------------------------------------------------------

    /**
     * Assign a shift to a volunteer for a specific request.
     * Checks for conflicts and creates reminders.
     */
    assignShift(input: {
        volunteerDid: string;
        requestPostUri: string;
        startTime: string;
        endTime: string;
        timezone?: string;
        assignedBy: string;
        availabilityWindowId?: string;
        notes?: string;
        reminderLeadTimes?: ReminderLeadTime[];
        now?: string;
    }): { shift: Shift; conflicts: ShiftConflict[]; reminders: ShiftReminder[] } {
        const now = input.now ?? new Date().toISOString();
        this.idCounter += 1;

        const shift: Shift = {
            id: `shift-${this.idCounter}`,
            volunteerDid: input.volunteerDid,
            requestPostUri: input.requestPostUri,
            availabilityWindowId: input.availabilityWindowId,
            startTime: input.startTime,
            endTime: input.endTime,
            timezone: input.timezone ?? 'UTC',
            status: 'scheduled',
            assignedBy: input.assignedBy,
            notes: input.notes,
            createdAt: now,
            updatedAt: now,
        };

        // Detect conflicts
        const existingShifts = this.getVolunteerShifts(input.volunteerDid)
            .filter(s => s.status !== 'cancelled' && s.status !== 'missed');
        const conflicts = detectConflicts(shift, existingShifts);

        this.shifts.set(shift.id, shift);

        // Create reminders
        const leadTimes = input.reminderLeadTimes ?? ['1_hour'];
        const shiftReminders: ShiftReminder[] = [];

        for (const leadTime of leadTimes) {
            const reminder = this.createReminder(shift, leadTime, now);
            shiftReminders.push(reminder);
        }

        return { shift, conflicts, reminders: shiftReminders };
    }

    getShift(shiftId: string): Shift | null {
        return this.shifts.get(shiftId) ?? null;
    }

    getVolunteerShifts(volunteerDid: string): Shift[] {
        return [...this.shifts.values()]
            .filter(s => s.volunteerDid === volunteerDid)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    getRequestShifts(requestPostUri: string): Shift[] {
        return [...this.shifts.values()]
            .filter(s => s.requestPostUri === requestPostUri)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    /**
     * Transition a shift to a new status.
     */
    transitionShift(
        shiftId: string,
        targetStatus: ShiftStatus,
        now?: string,
    ): { statusCode: number; shift?: Shift; error?: string } {
        const shift = this.shifts.get(shiftId);
        if (!shift) {
            return { statusCode: 404, error: `Shift not found: ${shiftId}` };
        }

        if (!isValidShiftTransition(shift.status, targetStatus)) {
            return {
                statusCode: 403,
                error: `Cannot transition shift from '${shift.status}' to '${targetStatus}'.`,
            };
        }

        shift.status = targetStatus;
        shift.updatedAt = now ?? new Date().toISOString();

        return { statusCode: 200, shift: { ...shift } };
    }

    // -------------------------------------------------------------------
    // Reminder management
    // -------------------------------------------------------------------

    private createReminder(
        shift: Shift,
        leadTime: ReminderLeadTime,
        now: string,
    ): ShiftReminder {
        this.idCounter += 1;
        const leadMs = REMINDER_LEAD_TIME_MS[leadTime];
        const shiftStart = new Date(shift.startTime).getTime();
        const scheduledAt = new Date(shiftStart - leadMs).toISOString();

        const reminder: ShiftReminder = {
            id: `reminder-${this.idCounter}`,
            shiftId: shift.id,
            volunteerDid: shift.volunteerDid,
            leadTime,
            scheduledAt,
            status: 'pending',
            createdAt: now,
        };

        const shiftReminders = this.reminders.get(shift.id) ?? [];
        shiftReminders.push(reminder);
        this.reminders.set(shift.id, shiftReminders);

        return reminder;
    }

    getReminders(shiftId: string): ShiftReminder[] {
        return this.reminders.get(shiftId) ?? [];
    }

    /**
     * Process due reminders. Returns reminders that should be sent now.
     */
    processDueReminders(now: string): ShiftReminder[] {
        const currentTime = new Date(now).getTime();
        const dueReminders: ShiftReminder[] = [];

        for (const [_shiftId, reminders] of this.reminders) {
            for (const reminder of reminders) {
                if (reminder.status !== 'pending') continue;

                const scheduledTime = new Date(reminder.scheduledAt).getTime();
                if (currentTime >= scheduledTime) {
                    reminder.status = 'sent';
                    dueReminders.push({ ...reminder });
                }
            }
        }

        return dueReminders;
    }

    /**
     * Acknowledge a reminder (e.g., volunteer confirms they saw it).
     */
    acknowledgeReminder(reminderId: string): boolean {
        for (const [_shiftId, reminders] of this.reminders) {
            const reminder = reminders.find(r => r.id === reminderId);
            if (reminder && reminder.status === 'sent') {
                reminder.status = 'acknowledged';
                return true;
            }
        }
        return false;
    }

    // -------------------------------------------------------------------
    // No-show / fallback handling
    // -------------------------------------------------------------------

    /**
     * Check for no-shows across all active shifts and trigger fallback actions.
     */
    checkNoShows(
        now: string,
        fallbackAction: FallbackAction = 'notify_coordinator',
    ): NoShowEvent[] {
        const newNoShows: NoShowEvent[] = [];

        for (const shift of this.shifts.values()) {
            if (shift.status !== 'scheduled' && shift.status !== 'confirmed') {
                continue;
            }

            if (isNoShow(shift, now)) {
                shift.status = 'missed';
                shift.updatedAt = now;

                const event: NoShowEvent = {
                    shiftId: shift.id,
                    volunteerDid: shift.volunteerDid,
                    requestPostUri: shift.requestPostUri,
                    detectedAt: now,
                    fallbackAction,
                };

                this.noShowEvents.push(event);
                newNoShows.push(event);
            }
        }

        return newNoShows;
    }

    getNoShowEvents(): NoShowEvent[] {
        return [...this.noShowEvents];
    }

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    addAvailabilityFromParams(body: unknown): SchedulingRouteResult {
        const obj = body as Record<string, unknown> | null;
        const volunteerDid = (typeof obj?.volunteerDid === 'string' ? obj.volunteerDid : '').trim();
        const startTime = (typeof obj?.startTime === 'string' ? obj.startTime : '').trim();
        const endTime = (typeof obj?.endTime === 'string' ? obj.endTime : '').trim();

        if (!volunteerDid || !startTime || !endTime) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: volunteerDid, startTime, endTime.' } },
            };
        }

        const recurrence: RecurrenceRule = obj?.recurrence
            ? (obj.recurrence as RecurrenceRule)
            : { pattern: 'weekly' };

        const window = this.addAvailabilityWindow({
            volunteerDid,
            startTime,
            endTime,
            timezone: typeof obj?.timezone === 'string' ? obj.timezone : undefined,
            recurrence,
            now: typeof obj?.now === 'string' ? obj.now : undefined,
        });

        return { statusCode: 200, body: window };
    }

    getAvailabilityFromParams(params: URLSearchParams): SchedulingRouteResult {
        const volunteerDid = params.get('volunteerDid')?.trim();
        if (!volunteerDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: volunteerDid.' } },
            };
        }

        return { statusCode: 200, body: { windows: this.getAvailabilityWindows(volunteerDid) } };
    }

    assignShiftFromParams(body: unknown): SchedulingRouteResult {
        const obj = body as Record<string, unknown> | null;
        const volunteerDid = (typeof obj?.volunteerDid === 'string' ? obj.volunteerDid : '').trim();
        const requestPostUri = (typeof obj?.requestPostUri === 'string' ? obj.requestPostUri : '').trim();
        const startTime = (typeof obj?.startTime === 'string' ? obj.startTime : '').trim();
        const endTime = (typeof obj?.endTime === 'string' ? obj.endTime : '').trim();
        const assignedBy = (typeof obj?.assignedBy === 'string' ? obj.assignedBy : '').trim();

        if (!volunteerDid || !requestPostUri || !startTime || !endTime || !assignedBy) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: volunteerDid, requestPostUri, startTime, endTime, assignedBy.' } },
            };
        }

        const result = this.assignShift({
            volunteerDid,
            requestPostUri,
            startTime,
            endTime,
            assignedBy,
            timezone: typeof obj?.timezone === 'string' ? obj.timezone : undefined,
            availabilityWindowId: typeof obj?.availabilityWindowId === 'string' ? obj.availabilityWindowId : undefined,
            notes: typeof obj?.notes === 'string' ? obj.notes : undefined,
            reminderLeadTimes: Array.isArray(obj?.reminderLeadTimes) ? obj.reminderLeadTimes as ReminderLeadTime[] : undefined,
            now: typeof obj?.now === 'string' ? obj.now : undefined,
        });

        return { statusCode: 200, body: result };
    }

    getVolunteerShiftsFromParams(params: URLSearchParams): SchedulingRouteResult {
        const volunteerDid = params.get('volunteerDid')?.trim();
        if (!volunteerDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: volunteerDid.' } },
            };
        }

        return { statusCode: 200, body: { shifts: this.getVolunteerShifts(volunteerDid) } };
    }

    transitionShiftFromParams(body: unknown): SchedulingRouteResult {
        const obj = body as Record<string, unknown> | null;
        const shiftId = (typeof obj?.shiftId === 'string' ? obj.shiftId : '').trim();
        const targetStatus = (typeof obj?.targetStatus === 'string' ? obj.targetStatus : '').trim();

        if (!shiftId || !targetStatus) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: shiftId, targetStatus.' } },
            };
        }

        const result = this.transitionShift(
            shiftId,
            targetStatus as ShiftStatus,
            typeof obj?.now === 'string' ? obj.now : undefined,
        );

        if (result.error) {
            return {
                statusCode: result.statusCode,
                body: { error: { code: 'TRANSITION_ERROR', message: result.error } },
            };
        }

        return { statusCode: 200, body: { shift: result.shift } };
    }

    checkNoShowsFromParams(body: unknown): SchedulingRouteResult {
        const obj = body as Record<string, unknown> | null;
        const now = (typeof obj?.now === 'string' ? obj.now : '').trim();
        if (!now) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: now.' } },
            };
        }

        const fallbackAction = typeof obj?.fallbackAction === 'string'
            ? obj.fallbackAction as FallbackAction
            : 'notify_coordinator';

        const events = this.checkNoShows(now, fallbackAction);
        return { statusCode: 200, body: { events, total: events.length } };
    }
}

export const createSchedulingService = (): SchedulingService => {
    return new SchedulingService();
};
