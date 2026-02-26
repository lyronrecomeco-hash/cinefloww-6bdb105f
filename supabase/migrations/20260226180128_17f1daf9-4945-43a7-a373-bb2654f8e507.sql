-- Restore video_cache from backup
INSERT INTO public.video_cache (tmdb_id, content_type, audio_type, video_url, video_type, provider, season, episode, expires_at)
SELECT tmdb_id, content_type, audio_type, video_url, video_type, provider, season, episode, 
       (now() + interval '7 days')
FROM public.video_cache_backup
ON CONFLICT (tmdb_id, content_type, audio_type, season, episode) DO NOTHING;

-- Remove duplicate trigger (there are 2 backup triggers)
DROP TRIGGER IF EXISTS trg_backup_video_cache ON public.video_cache;