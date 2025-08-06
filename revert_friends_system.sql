-- Revert Friends System - Database Rollback Script
-- This script removes the friends system and reverts to the original commentator_info structure

-- 1. Drop the user_connections table and related indexes
DROP TABLE IF EXISTS user_connections CASCADE;

-- 2. Remove the authorship columns from commentator_info
ALTER TABLE commentator_info 
DROP COLUMN IF EXISTS created_by,
DROP COLUMN IF EXISTS author_name;

-- 3. Drop the new RLS policies that were created for the friends system
DROP POLICY IF EXISTS "Access own and friends commentator info" ON commentator_info;
DROP POLICY IF EXISTS "Edit only own commentator info" ON commentator_info;
DROP POLICY IF EXISTS "Update only own commentator info" ON commentator_info;
DROP POLICY IF EXISTS "Delete only own commentator info" ON commentator_info;

-- 4. Recreate the original RLS policies
-- Allow all users to read non-deleted records
CREATE POLICY "Enable read access for non-deleted records" ON commentator_info
  FOR SELECT USING (deleted_at IS NULL);

-- Allow all users to insert
CREATE POLICY "Enable insert access for all users" ON commentator_info
  FOR INSERT WITH CHECK (true);

-- Allow all users to update non-deleted records
CREATE POLICY "Enable update access for non-deleted records" ON commentator_info
  FOR UPDATE USING (deleted_at IS NULL);

-- Allow soft delete for all users
CREATE POLICY "Enable soft delete for all users" ON commentator_info
  FOR UPDATE USING (true);

-- 5. Drop the indexes that were created for the friends system
DROP INDEX IF EXISTS idx_commentator_info_created_by;

-- 6. Drop the get_user_profile function
DROP FUNCTION IF EXISTS get_user_profile(UUID);

-- 7. Drop the update_updated_at_column function and trigger for user_connections
DROP TRIGGER IF EXISTS update_user_connections_updated_at ON user_connections;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Note: We keep the update_updated_at_column function for commentator_info as it's still needed
-- The trigger for commentator_info should remain intact

-- 8. Verify the commentator_info table structure matches the original
-- The table should now have these columns:
-- id, athlete_id, homebase, team, sponsors, favorite_trick, achievements, 
-- injuries, fun_facts, notes, social_media, created_at, updated_at, deleted_at

-- 9. Optional: Clean up any orphaned data (if needed)
-- This would depend on your specific situation

-- Verification query to check the current structure
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'commentator_info' 
ORDER BY ordinal_position; 