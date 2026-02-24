-- Drop the COALESCE-based index (Supabase JS can't match it)
DROP INDEX IF EXISTS public.video_cache_unique_key;

-- Set null seasons/episodes to 0 so we can use a plain unique constraint
UPDATE public.video_cache SET season = 0 WHERE season IS NULL;
UPDATE public.video_cache SET episode = 0 WHERE episode IS NULL;

-- Set column defaults
ALTER TABLE public.video_cache ALTER COLUMN season SET DEFAULT 0;
ALTER TABLE public.video_cache ALTER COLUMN episode SET DEFAULT 0;

-- Create plain unique constraint that Supabase JS can match
ALTER TABLE public.video_cache
ADD CONSTRAINT video_cache_tmdb_type_audio_se_unique
UNIQUE (tmdb_id, content_type, audio_type, season, episode);