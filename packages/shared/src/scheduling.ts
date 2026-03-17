/**
 * Calendar and volunteer shift scheduling contracts.
 *
 * Defines availability windows, shift types, recurrence rules,
 * reminder types, conflict detection, and no-show fallback flows.
 */

// ---------------------------------------------------------------------------
// Days of week
// ---------------------------------------------------------------------------

export const DAYS_OF_WEEK = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

// ---------------------------------------------------------------------------
// Recurrence rules
// ---------------------------------------------------------------------------

export const RECURRENCE_PATTERNS = [
    'once',
    'daily',
    'weekly',
    'biweekly',
    'monthly',
] as const;

export type RecurrencePattern = (typeof RECURRENCE_PATTERNS)[number];

export interface RecurrenceRule {
    pattern: RecurrencePattern;
    /** Specific days for weekly/biweekly patterns. */
    daysOfWeek?: DayOfWeek[];
    /** Day of month for monthly patterns (1-31). */
    dayOfMonth?: number;
    /** When the recurrence ends. Undefined = no end date. */
    endsAt?: string;
}

// ---------------------------------------------------------------------------
// Availability windows
// ---------------------------------------------------------------------------

export interface AvailabilityWindow {
    id: string;
    volunteerDid: string;
    /** Start time in HH:MM format (24-hour). */
    startTime: string;
    /** End time in HH:MM format (24-hour). */
    endTime: string;
    /** Timezone identifier (e.g., 'America/New_York'). */
    timezone: string;
    recurrence: RecurrenceRule;
    /** Whether this window is currently active. */
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

// ---------------------------------------------------------------------------
// Shift types
// ---------------------------------------------------------------------------

export const SHIFT_STATUSES = [
    'scheduled',
    'confirmed',
    'in_progress',
    'completed',
    'missed',
    'cancelled',
] as const;

export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export interface Shift {
    id: string;
    volunteerDid: string;
    /** The aid request this shift is linked to. */
    requestPostUri: string;
    /** Availability window this shift was derived from, if any. */
    availabilityWindowId?: string;
    startTime: string;
    endTime: string;
    timezone: string;
    status: ShiftStatus;
    /** Coordinator or system that created the shift. */
    assignedBy: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

// ---------------------------------------------------------------------------
// Reminder types
// ---------------------------------------------------------------------------

export const REMINDER_LEAD_TIMES = [
    '15_minutes',
    '30_minutes',
    '1_hour',
    '2_hours',
    '1_day',
] as const;

export type ReminderLeadTime = (typeof REMINDER_LEAD_TIMES)[number];

export const REMINDER_LEAD_TIME_MS: Readonly<Record<ReminderLeadTime, number>> = {
    '15_minutes': 15 * 60 * 1000,
    '30_minutes': 30 * 60 * 1000,
    '1_hour': 60 * 60 * 1000,
    '2_hours': 2 * 60 * 60 * 1000,
    '1_day': 24 * 60 * 60 * 1000,
};

export const REMINDER_STATUSES = [
    'pending',
    'sent',
    'acknowledged',
    'failed',
] as const;

export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export interface ShiftReminder {
    id: string;
    shiftId: string;
    volunteerDid: string;
    leadTime: ReminderLeadTime;
    /** When the reminder should fire. */
    scheduledAt: string;
    status: ReminderStatus;
    /** Notification ID once sent, for cross-referencing. */
    notificationId?: string;
    createdAt: string;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

export interface ShiftConflict {
    shiftId: string;
    conflictingShiftId: string;
    overlapStart: string;
    overlapEnd: string;
    volunteerDid: string;
}

/**
 * Detect whether two time ranges overlap.
 * Inputs are ISO datetime strings.
 */
export const hasTimeOverlap = (
    startA: string,
    endA: string,
    startB: string,
    endB: string,
): boolean => {
    const a0 = new Date(startA).getTime();
    const a1 = new Date(endA).getTime();
    const b0 = new Date(startB).getTime();
    const b1 = new Date(endB).getTime();

    return a0 < b1 && b0 < a1;
};

/**
 * Find all conflicts between a candidate shift and existing shifts.
 */
export const detectConflicts = (
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

// ---------------------------------------------------------------------------
// No-show / fallback handling
// ---------------------------------------------------------------------------

export const FALLBACK_ACTIONS = [
    'reassign',
    'escalate',
    'notify_coordinator',
    'cancel_shift',
] as const;

export type FallbackAction = (typeof FALLBACK_ACTIONS)[number];

export interface NoShowEvent {
    shiftId: string;
    volunteerDid: string;
    requestPostUri: string;
    detectedAt: string;
    fallbackAction: FallbackAction;
    reassignedTo?: string;
}

/**
 * Grace period in milliseconds after shift start before a no-show is declared.
 * Default: 15 minutes.
 */
export const NO_SHOW_GRACE_MS = 15 * 60 * 1000;

/**
 * Check whether a shift should be flagged as a no-show.
 */
export const isNoShow = (
    shift: Pick<Shift, 'startTime' | 'status'>,
    now: string,
): boolean => {
    if (shift.status !== 'scheduled' && shift.status !== 'confirmed') {
        return false;
    }

    const shiftStart = new Date(shift.startTime).getTime();
    const currentTime = new Date(now).getTime();

    return currentTime > shiftStart + NO_SHOW_GRACE_MS;
};

// ---------------------------------------------------------------------------
// Shift transition rules
// ---------------------------------------------------------------------------

export const SHIFT_TRANSITION_GRAPH: Readonly<
    Record<ShiftStatus, readonly ShiftStatus[]>
> = {
    scheduled: ['confirmed', 'cancelled', 'missed'],
    confirmed: ['in_progress', 'cancelled', 'missed'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    missed: [],
    cancelled: [],
};

/**
 * Check if a shift status transition is valid.
 */
export const isValidShiftTransition = (
    from: ShiftStatus,
    to: ShiftStatus,
): boolean => {
    if (from === to) return true;
    return SHIFT_TRANSITION_GRAPH[from].includes(to);
};

// ---------------------------------------------------------------------------
// Availability check helpers
// ---------------------------------------------------------------------------

/**
 * Parse a HH:MM time string into minutes since midnight.
 */
export const parseTimeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
};

/**
 * Check if a given time (HH:MM) falls within an availability window's time range.
 */
export const isWithinTimeRange = (
    time: string,
    startTime: string,
    endTime: string,
): boolean => {
    const t = parseTimeToMinutes(time);
    const s = parseTimeToMinutes(startTime);
    const e = parseTimeToMinutes(endTime);

    if (s <= e) {
        return t >= s && t < e;
    }
    // Overnight window (e.g., 22:00 - 06:00)
    return t >= s || t < e;
};
