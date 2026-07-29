CREATE TABLE IF NOT EXISTS volunteer_private_profiles (
    did TEXT PRIMARY KEY CHECK (
        did ~ '^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$'
    ),
    contact_email TEXT CHECK (
        contact_email IS NULL OR length(contact_email) <= 254
    ),
    contact_phone TEXT CHECK (
        contact_phone IS NULL OR length(contact_phone) <= 40
    ),
    availability_windows JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
        jsonb_typeof(availability_windows) = 'array'
    ),
    matching_preferences JSONB NOT NULL CHECK (
        jsonb_typeof(matching_preferences) = 'object'
    ),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
