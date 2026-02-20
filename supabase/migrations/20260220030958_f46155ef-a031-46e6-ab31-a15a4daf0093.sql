-- Add unique constraint for video_cache upserts from visioncine
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_cache_unique_content'
  ) THEN
    ALTER TABLE public.video_cache ADD CONSTRAINT video_cache_unique_content 
    UNIQUE (tmdb_id, content_type, audio_type, season, episode);
  END IF;
END $$;