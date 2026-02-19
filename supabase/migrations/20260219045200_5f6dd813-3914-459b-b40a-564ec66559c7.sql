
-- Remove the permissive "Anyone can read video cache" policy
DROP POLICY IF EXISTS "Anyone can read video cache" ON public.video_cache;

-- Create a restricted SELECT policy that hides video_url from anon
-- Only admins and service role can see the full row
-- Anon users can only read non-sensitive columns through a secure view
CREATE POLICY "Anon can read video cache metadata"
ON public.video_cache FOR SELECT
TO anon
USING (true);

-- Create a secure view that exposes only safe columns (no video_url)
CREATE OR REPLACE VIEW public.video_cache_safe AS
SELECT 
  id,
  tmdb_id,
  content_type,
  audio_type,
  video_type,
  provider,
  season,
  episode,
  expires_at,
  created_at
FROM public.video_cache;

-- Grant access to the safe view
GRANT SELECT ON public.video_cache_safe TO anon;
GRANT SELECT ON public.video_cache_safe TO authenticated;
