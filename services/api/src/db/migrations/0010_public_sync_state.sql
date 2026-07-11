ALTER TABLE request_workflows
    ADD COLUMN IF NOT EXISTS public_sync_state TEXT CHECK (
        public_sync_state IN ('pending', 'synced', 'failed')
    ),
    ADD COLUMN IF NOT EXISTS public_sync_error_code TEXT,
    ADD COLUMN IF NOT EXISTS public_sync_attempted_at TIMESTAMPTZ;

UPDATE request_workflows
SET public_sync_state = 'synced',
    public_sync_attempted_at = public_synced_at
WHERE public_status IS NOT NULL
  AND public_sync_state IS NULL;
