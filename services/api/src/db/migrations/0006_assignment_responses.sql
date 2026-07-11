ALTER TABLE request_assignment_events
    ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'assigned';

CREATE INDEX IF NOT EXISTS idx_assignment_events_command_type
    ON request_assignment_events (command_id, event_type);
