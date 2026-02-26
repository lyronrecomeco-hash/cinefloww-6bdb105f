-- Wipe video_cache completely for fresh CineVeo import
TRUNCATE TABLE public.video_cache;

-- Clear import progress
DELETE FROM public.site_settings WHERE key IN ('cineveo_import_progress', 'cineveo_vps_progress');

-- Clear resolve_failures to allow re-resolution
TRUNCATE TABLE public.resolve_failures;