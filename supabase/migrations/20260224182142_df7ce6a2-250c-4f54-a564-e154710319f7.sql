-- Create missing unique constraint on video_cache for upserts
CREATE UNIQUE INDEX IF NOT EXISTS video_cache_unique_key
ON public.video_cache (tmdb_id, content_type, audio_type, COALESCE(season, -1), COALESCE(episode, -1));

-- Also add unique on content for tmdb_id,content_type (many upserts depend on this)
CREATE UNIQUE INDEX IF NOT EXISTS content_tmdb_unique
ON public.content (tmdb_id, content_type);

-- Also add unique on push_subscriptions.endpoint
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
ON public.push_subscriptions (endpoint);