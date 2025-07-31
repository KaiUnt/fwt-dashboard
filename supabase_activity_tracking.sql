-- ===============================================================
-- ACTIVITY TRACKING EXTENSION für FWT Dashboard
-- User Login/Activity Monitoring mit Supabase Auth
-- ===============================================================

-- 1. USER PROFILES TABLE (erweitert auth.users)
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'commentator' CHECK (role IN ('admin', 'commentator', 'viewer')),
  organization TEXT DEFAULT 'FWT',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. LOGIN ACTIVITY TRACKING
CREATE TABLE user_login_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  login_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  device_info JSONB DEFAULT '{}',
  location_info JSONB DEFAULT '{}',
  session_duration INTERVAL,
  logout_timestamp TIMESTAMP WITH TIME ZONE,
  login_method TEXT DEFAULT 'email' CHECK (login_method IN ('email', 'google', 'github', 'microsoft'))
);

-- 3. USER ACTIONS AUDIT LOG
CREATE TABLE user_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'view_event', 'edit_commentator_info', 'export_data', etc.
  resource_type TEXT, -- 'event', 'athlete', 'commentator_info'
  resource_id TEXT,
  action_details JSONB DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- 4. FAILED LOGIN ATTEMPTS (Security Monitoring)
CREATE TABLE failed_login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  ip_address INET,
  attempt_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  failure_reason TEXT, -- 'wrong_password', 'user_not_found', 'too_many_attempts'
  user_agent TEXT
);

-- ===============================================================
-- INDEXES für Performance
-- ===============================================================

CREATE INDEX idx_login_activity_user_id ON user_login_activity(user_id);
CREATE INDEX idx_login_activity_timestamp ON user_login_activity(login_timestamp DESC);
CREATE INDEX idx_user_actions_user_id ON user_actions(user_id);
CREATE INDEX idx_user_actions_timestamp ON user_actions(timestamp DESC);
CREATE INDEX idx_user_actions_type ON user_actions(action_type);
CREATE INDEX idx_failed_attempts_ip ON failed_login_attempts(ip_address);
CREATE INDEX idx_failed_attempts_timestamp ON failed_login_attempts(attempt_timestamp DESC);

-- ===============================================================
-- RLS POLICIES (Row Level Security)
-- ===============================================================

-- User Profiles: Users can read own profile, admins can read all
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON user_profiles
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM user_profiles WHERE role = 'admin'
    )
  );

-- Login Activity: Users can view own activity, admins can view all
ALTER TABLE user_login_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own login activity" ON user_login_activity
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all login activity" ON user_login_activity
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM user_profiles WHERE role = 'admin'
    )
  );

-- User Actions: Users can view own actions, admins can view all
ALTER TABLE user_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own actions" ON user_actions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all actions" ON user_actions
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM user_profiles WHERE role = 'admin'
    )
  );

-- Failed Attempts: Only admins can view (security)
ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view failed attempts" ON failed_login_attempts
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM user_profiles WHERE role = 'admin'
    )
  );

-- ===============================================================
-- FUNCTIONS für automatisches Tracking
-- ===============================================================

-- Automatic login tracking trigger
CREATE OR REPLACE FUNCTION track_user_login()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_login_activity (user_id, login_timestamp, login_method)
  VALUES (NEW.id, NOW(), 'email');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update session duration on logout
CREATE OR REPLACE FUNCTION update_session_duration(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_login_activity 
  SET 
    logout_timestamp = NOW(),
    session_duration = NOW() - login_timestamp
  WHERE user_id = user_uuid 
    AND logout_timestamp IS NULL
    AND login_timestamp > NOW() - INTERVAL '24 hours'
  ORDER BY login_timestamp DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to log user actions
CREATE OR REPLACE FUNCTION log_user_action(
  p_user_id UUID,
  p_action_type TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_action_details JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_actions (user_id, action_type, resource_type, resource_id, action_details)
  VALUES (p_user_id, p_action_type, p_resource_type, p_resource_id, p_action_details);
END;
$$ LANGUAGE plpgsql;

-- ===============================================================
-- VIEWS für einfache Abfragen
-- ===============================================================

-- Active Sessions View
CREATE VIEW active_sessions AS
SELECT 
  up.full_name,
  up.email,
  up.role,
  ula.login_timestamp,
  ula.ip_address,
  ula.device_info,
  EXTRACT(EPOCH FROM (NOW() - ula.login_timestamp))/60 AS session_minutes
FROM user_login_activity ula
JOIN user_profiles up ON ula.user_id = up.id
WHERE ula.logout_timestamp IS NULL
  AND ula.login_timestamp > NOW() - INTERVAL '24 hours'
ORDER BY ula.login_timestamp DESC;

-- Daily Login Statistics
CREATE VIEW daily_login_stats AS
SELECT 
  DATE(login_timestamp) as login_date,
  COUNT(*) as total_logins,
  COUNT(DISTINCT user_id) as unique_users,
  AVG(EXTRACT(EPOCH FROM session_duration)/60) as avg_session_minutes
FROM user_login_activity
WHERE login_timestamp > NOW() - INTERVAL '30 days'
GROUP BY DATE(login_timestamp)
ORDER BY login_date DESC;

-- Security Alert View (suspicious activity)
CREATE VIEW security_alerts AS
SELECT 
  'Multiple Failed Attempts' as alert_type,
  email,
  ip_address,
  COUNT(*) as attempt_count,
  MAX(attempt_timestamp) as last_attempt
FROM failed_login_attempts
WHERE attempt_timestamp > NOW() - INTERVAL '1 hour'
GROUP BY email, ip_address
HAVING COUNT(*) > 5
UNION ALL
SELECT 
  'Multiple Locations' as alert_type,
  up.email,
  ula.ip_address,
  COUNT(*) as login_count,
  MAX(ula.login_timestamp) as last_login
FROM user_login_activity ula
JOIN user_profiles up ON ula.user_id = up.id
WHERE ula.login_timestamp > NOW() - INTERVAL '24 hours'
GROUP BY up.email, ula.ip_address
HAVING COUNT(*) > 1;

-- ===============================================================
-- SAMPLE QUERIES für Admin Dashboard
-- ===============================================================

/*
-- Wer ist gerade online?
SELECT * FROM active_sessions;

-- Login-Aktivität der letzten 7 Tage
SELECT * FROM daily_login_stats LIMIT 7;

-- Sicherheitswarnungen
SELECT * FROM security_alerts;

-- Detaillierte User-Aktivität
SELECT 
  up.full_name,
  ua.action_type,
  ua.resource_type,
  ua.timestamp
FROM user_actions ua
JOIN user_profiles up ON ua.user_id = up.id
WHERE ua.timestamp > NOW() - INTERVAL '24 hours'
ORDER BY ua.timestamp DESC;

-- Durchschnittliche Session-Dauer pro User
SELECT 
  up.full_name,
  up.email,
  AVG(EXTRACT(EPOCH FROM ula.session_duration)/60) as avg_session_minutes,
  COUNT(*) as total_sessions
FROM user_login_activity ula
JOIN user_profiles up ON ula.user_id = up.id
WHERE ula.session_duration IS NOT NULL
GROUP BY up.id, up.full_name, up.email
ORDER BY avg_session_minutes DESC;
*/