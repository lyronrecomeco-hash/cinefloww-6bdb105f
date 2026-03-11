
-- Create a trigger function to auto-notify Telegram when new content is added
CREATE OR REPLACE FUNCTION public.notify_telegram_new_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  config_row RECORD;
  payload jsonb;
BEGIN
  -- Check if auto-notify is enabled
  SELECT * INTO config_row FROM public.telegram_config LIMIT 1;
  IF config_row IS NULL OR NOT config_row.auto_notify_new_content OR config_row.channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build payload and call edge function asynchronously via pg_net
  payload := jsonb_build_object(
    'title', NEW.title,
    'original_title', NEW.original_title,
    'content_type', NEW.content_type,
    'tmdb_id', NEW.tmdb_id,
    'poster_path', NEW.poster_path,
    'backdrop_path', NEW.backdrop_path,
    'overview', NEW.overview,
    'vote_average', NEW.vote_average,
    'release_date', NEW.release_date
  );

  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/telegram-bot?action=notifyContent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('content', payload)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the insert if notification fails
  RETURN NEW;
END;
$$;

-- Create trigger on content table for new inserts
DROP TRIGGER IF EXISTS trg_notify_telegram_new_content ON public.content;
CREATE TRIGGER trg_notify_telegram_new_content
  AFTER INSERT ON public.content
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_content();
