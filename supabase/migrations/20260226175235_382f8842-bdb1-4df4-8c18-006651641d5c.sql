
-- Drop the backup trigger temporarily
DROP TRIGGER IF EXISTS trigger_backup_video_cache ON video_cache;

-- Clean everything
TRUNCATE video_cache CASCADE;
TRUNCATE video_cache_backup CASCADE;
TRUNCATE content CASCADE;
TRUNCATE resolve_failures CASCADE;
TRUNCATE resolve_logs CASCADE;

-- Recreate the backup trigger
CREATE TRIGGER trigger_backup_video_cache
  AFTER INSERT OR UPDATE ON video_cache
  FOR EACH ROW
  EXECUTE FUNCTION backup_video_cache();
