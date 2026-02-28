
-- Support tickets table
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ticket messages table
CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'user', -- 'user' or 'admin'
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_ticket_messages_ticket ON public.ticket_messages(ticket_id);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- RLS for support_tickets
CREATE POLICY "Users read own tickets" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users create own tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own tickets" ON public.support_tickets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all tickets" ON public.support_tickets
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS for ticket_messages
CREATE POLICY "Users read own ticket messages" ON public.ticket_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_tickets st WHERE st.id = ticket_messages.ticket_id AND st.user_id = auth.uid())
  );

CREATE POLICY "Users send messages on own tickets" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    sender_type = 'user' AND
    EXISTS (SELECT 1 FROM public.support_tickets st WHERE st.id = ticket_messages.ticket_id AND st.user_id = auth.uid())
  );

CREATE POLICY "Admins manage all messages" ON public.ticket_messages
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for ticket updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;

-- Update trigger
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
