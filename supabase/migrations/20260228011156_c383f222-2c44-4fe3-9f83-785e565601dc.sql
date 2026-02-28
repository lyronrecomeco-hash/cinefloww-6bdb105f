
-- Enable pg_net and pg_cron extensions if not already
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Create a cron job that triggers sync-catalog every 4 hours
SELECT cron.schedule(
  'auto-sync-catalog',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mfcnkltcdvitxczjwoer.supabase.co/functions/v1/sync-catalog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"action":"sync","phase":"crawl","type":"movies","page":1,"batch":0}'::jsonb
  );
  $$
);
