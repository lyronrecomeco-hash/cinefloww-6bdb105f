
CREATE OR REPLACE FUNCTION public.get_video_stats_by_provider()
RETURNS TABLE(provider text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT vc.provider, count(DISTINCT vc.tmdb_id) as cnt
  FROM public.video_cache vc
  WHERE vc.expires_at > now()
  GROUP BY vc.provider
  ORDER BY cnt DESC;
$$;
