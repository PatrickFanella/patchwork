ALTER TABLE request_workflows
    ADD COLUMN IF NOT EXISTS public_status TEXT CHECK (
        public_status IN ('open', 'in-progress', 'resolved', 'closed')
    ),
    ADD COLUMN IF NOT EXISTS public_cid TEXT,
    ADD COLUMN IF NOT EXISTS public_synced_at TIMESTAMPTZ;
