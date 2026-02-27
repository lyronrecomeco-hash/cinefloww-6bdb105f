
DROP TRIGGER IF EXISTS trigger_backup_video_cache ON video_cache;
TRUNCATE resolve_logs;
TRUNCATE resolve_failures;
TRUNCATE video_cache_backup;
TRUNCATE video_cache;
TRUNCATE api_access_log;
DELETE FROM site_settings WHERE key IN ('vps_api_url','vps_service_key','vps_heartbeat','cineveo_vps_progress','cineveo_import_progress','catalog_sync_progress');
CREATE TRIGGER trigger_backup_video_cache AFTER INSERT OR UPDATE ON video_cache FOR EACH ROW EXECUTE FUNCTION backup_video_cache();
