ALTER TABLE public.video_cache DROP CONSTRAINT IF EXISTS video_cache_unique_content;
ALTER TABLE public.video_cache DROP CONSTRAINT IF EXISTS video_cache_tmdb_id_content_type_audio_type_season_episode_key;

CREATE UNIQUE INDEX video_cache_unique_content ON public.video_cache 
  USING btree (tmdb_id, content_type, audio_type, COALESCE(season, -1), COALESCE(episode, -1));