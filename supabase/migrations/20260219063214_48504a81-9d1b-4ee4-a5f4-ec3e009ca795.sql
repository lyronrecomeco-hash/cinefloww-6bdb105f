
-- Table for live TV channels
CREATE TABLE public.tv_channels (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  stream_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Variedades',
  categories INTEGER[] DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for TV categories
CREATE TABLE public.tv_categories (
  id INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.tv_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_categories ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Anyone can read active channels" ON public.tv_channels FOR SELECT USING (true);
CREATE POLICY "Admins can manage channels" ON public.tv_channels FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can read tv categories" ON public.tv_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage tv categories" ON public.tv_categories FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_tv_channels_updated_at
BEFORE UPDATE ON public.tv_channels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
