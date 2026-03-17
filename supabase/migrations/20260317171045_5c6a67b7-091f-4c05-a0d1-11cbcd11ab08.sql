-- Recreate triggers for Telegram notifications (reports, tickets, support messages)

-- 1. Trigger for new content reports
DROP TRIGGER IF EXISTS trg_notify_telegram_new_report ON public.content_reports;
CREATE TRIGGER trg_notify_telegram_new_report
  AFTER INSERT ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_report();

-- 2. Trigger for new support tickets
DROP TRIGGER IF EXISTS trg_notify_telegram_new_ticket ON public.support_tickets;
CREATE TRIGGER trg_notify_telegram_new_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_ticket();

-- 3. Trigger for new ticket messages (support messages)
DROP TRIGGER IF EXISTS trg_notify_telegram_new_ticket_message ON public.ticket_messages;
CREATE TRIGGER trg_notify_telegram_new_ticket_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_ticket_message();