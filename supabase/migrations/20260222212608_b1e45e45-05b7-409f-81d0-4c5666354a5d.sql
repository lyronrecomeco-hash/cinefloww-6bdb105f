CREATE TABLE IF NOT EXISTS public.video_cache_backup (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tmdb_id integer NOT NULL,
  content_type text NOT NULL,
  audio_type text NOT NULL DEFAULT 'legendado',
  video_url text NOT NULL,
  video_type text NOT NULL DEFAULT 'm3u8',
  provider text NOT NULL DEFAULT 'unknown',
  season integer,
  episode integer,
  backed_up_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tmdb_id, content_type, audio_type, season, episode)
);

ALTER TABLE public.video_cache_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage video_cache_backup" ON public.video_cache_backup
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon can read video_cache_backup" ON public.video_cache_backup
  FOR SELECT USING (true);