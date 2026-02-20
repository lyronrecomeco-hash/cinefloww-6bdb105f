
-- Table to store Discord bot configuration
CREATE TABLE public.discord_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text,
  notification_channel_id text,
  bot_status text NOT NULL DEFAULT 'inactive',
  auto_notify_new_content boolean NOT NULL DEFAULT true,
  welcome_message text DEFAULT 'Bem-vindo ao servidor LyneFlix! 🎬',
  site_url text DEFAULT 'https://cinefloww.lovable.app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage discord config" ON public.discord_config
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can read discord config" ON public.discord_config
  FOR SELECT USING (true);

-- Table to log discord bot actions
CREATE TABLE public.discord_bot_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  details text,
  guild_id text,
  channel_id text,
  user_tag text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_bot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage discord logs" ON public.discord_bot_logs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service can insert logs" ON public.discord_bot_logs
  FOR INSERT WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_discord_config_updated_at
  BEFORE UPDATE ON public.discord_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.discord_bot_logs;
