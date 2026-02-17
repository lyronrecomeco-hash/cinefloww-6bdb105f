
-- Fast RPC to get unresolved content (not in video_cache or resolve_failures)
CREATE OR REPLACE FUNCTION public.get_unresolved_content(batch_limit integer DEFAULT 30)
RETURNS TABLE(tmdb_id integer, imdb_id text, content_type text, title text)
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT c.tmdb_id::integer, c.imdb_id, c.content_type, c.title
  FROM public.content c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.video_cache vc 
    WHERE vc.tmdb_id = c.tmdb_id AND vc.expires_at > now()
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.resolve_failures rf 
    WHERE rf.tmdb_id = c.tmdb_id
  )
  ORDER BY c.title ASC
  LIMIT batch_limit;
$$;
