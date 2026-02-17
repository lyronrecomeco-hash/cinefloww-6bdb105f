
-- Tabela para alertas/avisos configuráveis pelo admin
CREATE TABLE public.site_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  button_text text NOT NULL DEFAULT 'Entendido',
  button_link text DEFAULT NULL,
  button_style text NOT NULL DEFAULT 'primary',
  interval_minutes integer NOT NULL DEFAULT 60,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.site_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active alerts" ON public.site_alerts
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert alerts" ON public.site_alerts
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update alerts" ON public.site_alerts
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete alerts" ON public.site_alerts
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_site_alerts_updated_at
  BEFORE UPDATE ON public.site_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.site_alerts;
