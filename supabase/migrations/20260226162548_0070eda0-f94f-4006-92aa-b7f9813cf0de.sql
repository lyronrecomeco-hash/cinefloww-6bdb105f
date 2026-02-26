DELETE FROM video_cache vc1
WHERE (vc1.season IS NULL OR vc1.episode IS NULL)
AND EXISTS (
  SELECT 1 FROM video_cache vc2
  WHERE vc2.tmdb_id = vc1.tmdb_id
  AND vc2.content_type = vc1.content_type
  AND vc2.audio_type = vc1.audio_type
  AND vc2.season = COALESCE(vc1.season, 0)
  AND vc2.episode = COALESCE(vc1.episode, 0)
  AND vc2.id != vc1.id
)