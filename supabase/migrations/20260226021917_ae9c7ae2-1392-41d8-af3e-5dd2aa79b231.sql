UPDATE public.video_cache 
SET video_url = REPLACE(video_url, 'cdn.lyneflix.online', 'cdf.lyneflix.online') 
WHERE video_url LIKE '%cdn.lyneflix.online%';

UPDATE public.video_cache_backup 
SET video_url = REPLACE(video_url, 'cdn.lyneflix.online', 'cdf.lyneflix.online') 
WHERE video_url LIKE '%cdn.lyneflix.online%';