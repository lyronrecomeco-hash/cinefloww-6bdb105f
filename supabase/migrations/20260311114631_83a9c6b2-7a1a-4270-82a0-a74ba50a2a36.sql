
CREATE TABLE public.telegram_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text,
  channel_username text,
  bot_username text,
  welcome_enabled boolean NOT NULL DEFAULT true,
  welcome_message text DEFAULT 'Bem-vindo ao canal oficial da LyneFlix! 🎬🍿',
  welcome_image_url text,
  scheduled_messages jsonb DEFAULT '[]'::jsonb,
  auto_notify_new_content boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage telegram config" ON public.telegram_config FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can read telegram config" ON public.telegram_config FOR SELECT TO public USING (true);
