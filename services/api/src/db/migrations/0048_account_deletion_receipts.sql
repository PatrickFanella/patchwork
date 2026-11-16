-- Keep the suppression hash indefinitely, but discard command/results after seven days.
ALTER TABLE account_deactivations ALTER COLUMN command_id DROP NOT NULL;
ALTER TABLE account_deactivations ALTER COLUMN requested_at DROP NOT NULL;
UPDATE account_deactivations
   SET retention_until = requested_at + INTERVAL '7 days'
 WHERE requested_at IS NOT NULL AND retention_until = 'infinity';
