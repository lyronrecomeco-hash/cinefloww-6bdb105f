
-- Add ad config settings for controlling ad counts
INSERT INTO site_settings (key, value) 
VALUES ('ad_config', '{"movie_ads": 1, "series_ads": 2, "enabled": true}')
ON CONFLICT (key) DO UPDATE SET value = '{"movie_ads": 1, "series_ads": 2, "enabled": true}', updated_at = now();
