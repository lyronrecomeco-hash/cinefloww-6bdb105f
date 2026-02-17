-- Enable Realtime on video_cache for live updates in Banco
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_cache;