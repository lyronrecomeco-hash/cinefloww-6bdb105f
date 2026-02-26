UPDATE video_cache SET season = 0 WHERE season IS NULL;
UPDATE video_cache SET episode = 0 WHERE episode IS NULL;