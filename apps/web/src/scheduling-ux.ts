import type {
    AvailabilityWindow,
    DayOfWeek,
    FallbackAction,
    NoShowEvent,
    RecurrencePattern,
    Shift,
    ShiftConflict,
    ShiftReminder,
    ShiftStatus,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Availability window view model
// ---------------------------------------------------------------------------

export interface AvailabilityWindowCardViewModel {
    id: string;
    volunteerDid: string;
    timeRange: string;
    timezone: string;
    recurrenceLabel: string;
    daysLabel: string;
    active: boolean;
}

const DAY_ABBREVIATIONS: Record<DayOfWeek, string> = {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun',
};

const RECURRENCE_LABELS: Record<RecurrencePattern, string> = {
    once: 'One-time',
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
};

export const toAvailabilityWindowCard = (
    window: AvailabilityWindow,
): AvailabilityWindowCardViewModel => ({
    id: window.id,
    volunteerDid: window.volunteerDid,
    timeRange: `${window.startTime} - ${window.endTime}`,
    timezone: window.timezone,
    recurrenceLabel: RECURRENCE_LABELS[window.recurrence.pattern],
    daysLabel: window.recurrence.daysOfWeek
        ? window.recurrence.daysOfWeek.map(d => DAY_ABBREVIATIONS[d]).join(', ')
        : 'All days',
    active: window.active,
});

// ---------------------------------------------------------------------------
// Shift card view model
// ---------------------------------------------------------------------------

export interface ShiftCardViewModel {
    id: string;
    volunteerDid: string;
    requestPostUri: string;
    dateLabel: string;
    timeRange: string;
    statusBadge: { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' };
    canConfirm: boolean;
    canStart: boolean;
    canComplete: boolean;
    canCancel: boolean;
    hasConflict: boolean;
    notes?: string;
}

const SHIFT_STATUS_BADGES: Record<ShiftStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
    scheduled: { label: 'Scheduled', tone: 'info' },
    confirmed: { label: 'Confirmed', tone: 'info' },
    in_progress: { label: 'In Progress', tone: 'info' },
    completed: { label: 'Completed', tone: 'success' },
    missed: { label: 'Missed', tone: 'danger' },
    cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const formatDateLabel = (isoDate: string): string => {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return 'Unknown date';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
};

const formatTimeRange = (start: string, end: string): string => {
    const formatTime = (iso: string): string => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '??:??';
        const hours = d.getUTCHours().toString().padStart(2, '0');
        const minutes = d.getUTCMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    return `${formatTime(start)} - ${formatTime(end)}`;
};

export const toShiftCard = (
    shift: Shift,
    conflicts: ShiftConflict[] = [],
): ShiftCardViewModel => ({
    id: shift.id,
    volunteerDid: shift.volunteerDid,
    requestPostUri: shift.requestPostUri,
    dateLabel: formatDateLabel(shift.startTime),
    timeRange: formatTimeRange(shift.startTime, shift.endTime),
    statusBadge: SHIFT_STATUS_BADGES[shift.status],
    canConfirm: shift.status === 'scheduled',
    canStart: shift.status === 'confirmed',
    canComplete: shift.status === 'in_progress',
    canCancel: shift.status === 'scheduled' || shift.status === 'confirmed' || shift.status === 'in_progress',
    hasConflict: conflicts.some(c => c.shiftId === shift.id || c.conflictingShiftId === shift.id),
    notes: shift.notes,
});

// ---------------------------------------------------------------------------
// Reminder view model
// ---------------------------------------------------------------------------

export interface ReminderViewModel {
    id: string;
    shiftId: string;
    leadTimeLabel: string;
    scheduledAt: string;
    status: string;
    statusTone: 'neutral' | 'info' | 'success' | 'danger';
}

const LEAD_TIME_LABELS: Record<string, string> = {
    '15_minutes': '15 minutes before',
    '30_minutes': '30 minutes before',
    '1_hour': '1 hour before',
    '2_hours': '2 hours before',
    '1_day': '1 day before',
};

const REMINDER_STATUS_TONES: Record<string, 'neutral' | 'info' | 'success' | 'danger'> = {
    pending: 'neutral',
    sent: 'info',
    acknowledged: 'success',
    failed: 'danger',
};

export const toReminderViewModel = (
    reminder: ShiftReminder,
): ReminderViewModel => ({
    id: reminder.id,
    shiftId: reminder.shiftId,
    leadTimeLabel: LEAD_TIME_LABELS[reminder.leadTime] ?? reminder.leadTime,
    scheduledAt: reminder.scheduledAt,
    status: reminder.status,
    statusTone: REMINDER_STATUS_TONES[reminder.status] ?? 'neutral',
});

// ---------------------------------------------------------------------------
// Conflict warning view model
// ---------------------------------------------------------------------------

export interface ConflictWarningViewModel {
    shiftId: string;
    conflictingShiftId: string;
    overlapDescription: string;
    volunteerDid: string;
}

export const toConflictWarning = (
    conflict: ShiftConflict,
): ConflictWarningViewModel => ({
    shiftId: conflict.shiftId,
    conflictingShiftId: conflict.conflictingShiftId,
    overlapDescription: `Overlaps from ${formatTimeRange(conflict.overlapStart, conflict.overlapEnd)}`,
    volunteerDid: conflict.volunteerDid,
});

// ---------------------------------------------------------------------------
// No-show alert view model
// ---------------------------------------------------------------------------

export interface NoShowAlertViewModel {
    shiftId: string;
    volunteerDid: string;
    requestPostUri: string;
    detectedAt: string;
    fallbackLabel: string;
    tone: 'danger';
}

const FALLBACK_LABELS: Record<FallbackAction, string> = {
    reassign: 'Reassign to another volunteer',
    escalate: 'Escalate to coordinator',
    notify_coordinator: 'Notify coordinator',
    cancel_shift: 'Cancel shift',
};

export const toNoShowAlert = (event: NoShowEvent): NoShowAlertViewModel => ({
    shiftId: event.shiftId,
    volunteerDid: event.volunteerDid,
    requestPostUri: event.requestPostUri,
    detectedAt: event.detectedAt,
    fallbackLabel: FALLBACK_LABELS[event.fallbackAction],
    tone: 'danger',
});

// ---------------------------------------------------------------------------
// Scheduling dashboard view model
// ---------------------------------------------------------------------------

export interface SchedulingDashboardViewModel {
    availabilityWindows: AvailabilityWindowCardViewModel[];
    upcomingShifts: ShiftCardViewModel[];
    pastShifts: ShiftCardViewModel[];
    reminders: ReminderViewModel[];
    conflictWarnings: ConflictWarningViewModel[];
    noShowAlerts: NoShowAlertViewModel[];
    isEmpty: boolean;
}

export const toSchedulingDashboard = (input: {
    windows: AvailabilityWindow[];
    shifts: Shift[];
    reminders: ShiftReminder[];
    conflicts: ShiftConflict[];
    noShowEvents: NoShowEvent[];
    now: string;
}): SchedulingDashboardViewModel => {
    const currentTime = new Date(input.now).getTime();

    const upcoming = input.shifts
        .filter(s =>
            s.status !== 'completed' &&
            s.status !== 'missed' &&
            s.status !== 'cancelled' &&
            new Date(s.startTime).getTime() >= currentTime,
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const past = input.shifts
        .filter(s =>
            s.status === 'completed' ||
            s.status === 'missed' ||
            s.status === 'cancelled' ||
            new Date(s.endTime).getTime() < currentTime,
        )
        .sort((a, b) => b.startTime.localeCompare(a.startTime));

    return {
        availabilityWindows: input.windows.map(toAvailabilityWindowCard),
        upcomingShifts: upcoming.map(s => toShiftCard(s, input.conflicts)),
        pastShifts: past.map(s => toShiftCard(s, input.conflicts)),
        reminders: input.reminders.map(toReminderViewModel),
        conflictWarnings: input.conflicts.map(toConflictWarning),
        noShowAlerts: input.noShowEvents.map(toNoShowAlert),
        isEmpty: input.shifts.length === 0 && input.windows.length === 0,
    };
};
