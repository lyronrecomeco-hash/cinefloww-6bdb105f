
-- Trigger function for new reports
CREATE OR REPLACE FUNCTION public.notify_telegram_new_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'report', jsonb_build_object(
      'title', NEW.title,
      'content_type', NEW.content_type,
      'tmdb_id', NEW.tmdb_id,
      'message', NEW.message,
      'page_url', NEW.page_url,
      'visitor_id', NEW.visitor_id
    )
  );

  PERFORM net.http_post(
    url := 'https://mfcnkltcdvitxczjwoer.supabase.co/functions/v1/telegram-bot?action=notifyReport',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mY25rbHRjZHZpdHhjemp3b2VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMzExOTgsImV4cCI6MjA4NjgwNzE5OH0.g8R1h217oI-y7zeBsvN7kfE9aPMlQZEEEbRCQLAEbXA"}'::jsonb,
    body := payload
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Trigger function for new tickets
CREATE OR REPLACE FUNCTION public.notify_telegram_new_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'ticket', jsonb_build_object(
      'user_email', NEW.user_email,
      'subject', NEW.subject,
      'status', NEW.status
    )
  );

  PERFORM net.http_post(
    url := 'https://mfcnkltcdvitxczjwoer.supabase.co/functions/v1/telegram-bot?action=notifyTicket',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mY25rbHRjZHZpdHhjemp3b2VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMzExOTgsImV4cCI6MjA4NjgwNzE5OH0.g8R1h217oI-y7zeBsvN7kfE9aPMlQZEEEbRCQLAEbXA"}'::jsonb,
    body := payload
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER trg_notify_telegram_new_report
  AFTER INSERT ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_report();

CREATE TRIGGER trg_notify_telegram_new_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_ticket();
