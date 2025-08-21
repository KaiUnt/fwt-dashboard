-- Credits System Migration Script
-- Run this in Supabase SQL Editor after creating the main schema

-- Ensure all existing users get 5 credits
-- This is idempotent - won't create duplicates

INSERT INTO user_credits (user_id, credits)
SELECT 
    au.id as user_id,
    5 as credits
FROM auth.users au
LEFT JOIN user_credits uc ON au.id = uc.user_id
WHERE uc.user_id IS NULL;

-- Create initial credit transactions for existing users who got credits
INSERT INTO credit_transactions (
    user_id, 
    transaction_type, 
    amount, 
    credits_before, 
    credits_after,
    description
)
SELECT 
    uc.user_id,
    'grant' as transaction_type,
    5 as amount,
    0 as credits_before,
    5 as credits_after,
    'Initial credits for existing user' as description
FROM user_credits uc
LEFT JOIN credit_transactions ct ON uc.user_id = ct.user_id
WHERE ct.user_id IS NULL;

-- Add RLS policy for admins to view all user profiles for granting credits
CREATE POLICY "Admins can view all user profiles" ON user_profiles 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = auth.uid() 
            AND up.role = 'admin'
        )
    );

-- Verification queries (run these to check the migration worked):

-- 1. Count users with credits
-- SELECT COUNT(*) as users_with_credits FROM user_credits;

-- 2. Total credits in system
-- SELECT SUM(credits) as total_credits FROM user_credits;

-- 3. Users without credits (should be 0 after migration)
-- SELECT COUNT(*) as users_without_credits 
-- FROM auth.users au 
-- LEFT JOIN user_credits uc ON au.id = uc.user_id 
-- WHERE uc.user_id IS NULL;

-- 4. Sample of credit transactions
-- SELECT 
--     ct.*,
--     up.full_name,
--     up.email
-- FROM credit_transactions ct
-- JOIN user_profiles up ON ct.user_id = up.id
-- ORDER BY ct.created_at DESC
-- LIMIT 10;