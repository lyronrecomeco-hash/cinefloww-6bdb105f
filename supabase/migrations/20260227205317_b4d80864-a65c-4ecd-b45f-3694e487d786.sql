
DROP TRIGGER IF EXISTS trigger_backup_video_cache ON video_cache;

TRUNCATE content CASCADE;
TRUNCATE video_cache CASCADE;
TRUNCATE video_cache_backup CASCADE;
TRUNCATE resolve_logs CASCADE;
TRUNCATE resolve_failures CASCADE;
TRUNCATE content_views CASCADE;
TRUNCATE content_reports CASCADE;
TRUNCATE content_requests CASCADE;
TRUNCATE api_access_log CASCADE;
TRUNCATE site_visitors CASCADE;
TRUNCATE discord_bot_logs CASCADE;
TRUNCATE auth_audit_log CASCADE;
TRUNCATE telegram_ingestions CASCADE;

DELETE FROM site_settings WHERE key NOT IN ('cache_version', 'ad_gate_enabled', 'maintenance_mode');

CREATE TRIGGER trigger_backup_video_cache
  AFTER INSERT OR UPDATE ON video_cache
  FOR EACH ROW
  EXECUTE FUNCTION backup_video_cache();
