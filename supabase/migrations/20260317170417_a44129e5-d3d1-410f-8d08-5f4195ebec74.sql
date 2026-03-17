-- Create trigger for new reports -> notify telegram
CREATE OR REPLACE TRIGGER trg_notify_telegram_new_report
  AFTER INSERT ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_report();

-- Create trigger for new tickets -> notify telegram
CREATE OR REPLACE TRIGGER trg_notify_telegram_new_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_ticket();

-- Create function for new ticket messages -> notify telegram with full details
CREATE OR REPLACE FUNCTION public.notify_telegram_new_ticket_message()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  payload jsonb;
  ticket_row RECORD;
BEGIN
  IF NEW.sender_type != 'user' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO ticket_row FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF ticket_row IS NULL THEN
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'support_message', jsonb_build_object(
      'email', ticket_row.user_email,
      'subject', ticket_row.subject,
      'message', NEW.message,
      'created_at', NEW.created_at
    )
  );

  PERFORM net.http_post(
    url := 'https://mfcnkltcdvitxczjwoer.supabase.co/functions/v1/telegram-bot?action=notifySupport',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mY25rbHRjZHZpdHhjemp3b2VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMzExOTgsImV4cCI6MjA4NjgwNzE5OH0.g8R1h217oI-y7zeBsvN7kfE9aPMlQZEEEbRCQLAEbXA"}'::jsonb,
    body := payload
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

-- Create trigger for ticket messages
CREATE OR REPLACE TRIGGER trg_notify_telegram_new_ticket_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_ticket_message();