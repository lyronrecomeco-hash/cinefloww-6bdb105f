
-- Create scraping_providers table for dynamic API management
CREATE TABLE public.scraping_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_url text NOT NULL,
  movie_url_template text NOT NULL DEFAULT '/embed/movie/{tmdb_id}',
  tv_url_template text NOT NULL DEFAULT '/embed/tv/{tmdb_id}/{season}/{episode}',
  priority integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  health_status text NOT NULL DEFAULT 'unknown',
  success_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  last_checked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraping_providers ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage scraping providers"
ON public.scraping_providers FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service can read providers"
ON public.scraping_providers FOR SELECT
USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.scraping_providers;

-- Seed with existing providers
INSERT INTO public.scraping_providers (name, base_url, movie_url_template, tv_url_template, priority, active, health_status) VALUES
('Primevício', 'http://primevicio.lat', '/embed/movie/{tmdb_id}', '/embed/tv/{tmdb_id}/{season}/{episode}', 1, true, 'healthy'),
('CineVeo CDN', 'https://cineveo.site', '/filmes/{slug}.html', '/series/{slug}.html', 2, true, 'healthy'),
('MegaEmbed', 'https://megaembed.xyz', '/embed/movie?tmdb={tmdb_id}', '/embed/tv?tmdb={tmdb_id}&season={season}&episode={episode}', 3, true, 'healthy'),
('EmbedPlay', 'https://embedplay.top', '/movie/{tmdb_id}', '/tv/{tmdb_id}/{season}/{episode}', 4, true, 'healthy'),
('PlayerFlix', 'https://playerflix.top', '/movie/{tmdb_id}', '/tv/{tmdb_id}/{season}/{episode}', 5, true, 'healthy');
