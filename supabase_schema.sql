-- Supabase Schema für Kommentatoren-Infos
-- Erstelle die Tabelle für Athleten-Kommentatoren-Informationen

CREATE TABLE commentator_info (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id TEXT NOT NULL,
  homebase TEXT,
  team TEXT,
  sponsors TEXT,
  favorite_trick TEXT,
  achievements TEXT,
  injuries TEXT,
  fun_facts TEXT,
  notes TEXT,
  social_media JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Index für schnelle Suche nach Athleten-ID
CREATE INDEX idx_commentator_info_athlete_id ON commentator_info(athlete_id);

-- Index für deleted_at für bessere Performance bei Soft-Delete-Queries
CREATE INDEX idx_commentator_info_deleted_at ON commentator_info(deleted_at);

-- RLS (Row Level Security) Policy - Alle können lesen und schreiben
-- Für Produktionsumgebung kann das später angepasst werden
ALTER TABLE commentator_info ENABLE ROW LEVEL SECURITY;

-- Nur nicht-gelöschte Einträge anzeigen
CREATE POLICY "Enable read access for non-deleted records" ON commentator_info
  FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY "Enable insert access for all users" ON commentator_info
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for non-deleted records" ON commentator_info
  FOR UPDATE USING (deleted_at IS NULL);

-- Soft-Delete: UPDATE statt DELETE
CREATE POLICY "Enable soft delete for all users" ON commentator_info
  FOR UPDATE USING (true);

-- Trigger für automatische updated_at Aktualisierung
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_commentator_info_updated_at
  BEFORE UPDATE ON commentator_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Funktion für Soft-Delete
CREATE OR REPLACE FUNCTION soft_delete_commentator_info(p_athlete_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE commentator_info 
  SET deleted_at = NOW() 
  WHERE athlete_id = p_athlete_id AND deleted_at IS NULL;
  
  -- Rückgabe ob ein Eintrag gefunden und "gelöscht" wurde
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Funktion für Restore (Wiederherstellen)
CREATE OR REPLACE FUNCTION restore_commentator_info(p_athlete_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE commentator_info 
  SET deleted_at = NULL 
  WHERE athlete_id = p_athlete_id AND deleted_at IS NOT NULL;
  
  -- Rückgabe ob ein Eintrag gefunden und wiederhergestellt wurde
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- View für gelöschte Einträge (für Wiederherstellung)
CREATE VIEW deleted_commentator_info AS
SELECT 
  *,
  EXTRACT(EPOCH FROM (NOW() - deleted_at)) / 86400 AS days_since_deleted
FROM commentator_info 
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- Kommentar
COMMENT ON TABLE commentator_info IS 'Speichert Kommentatoren-Zusatzinformationen für Athleten';
COMMENT ON COLUMN commentator_info.athlete_id IS 'ID des Athleten (aus LiveHeats API)';
COMMENT ON COLUMN commentator_info.homebase IS 'Heimatort/Homebase des Athleten';
COMMENT ON COLUMN commentator_info.team IS 'Aktuelles Team des Athleten';
COMMENT ON COLUMN commentator_info.sponsors IS 'Sponsoren des Athleten';
COMMENT ON COLUMN commentator_info.favorite_trick IS 'Lieblingstrick des Athleten';
COMMENT ON COLUMN commentator_info.achievements IS 'Wichtige Erfolge und Achievements';
COMMENT ON COLUMN commentator_info.injuries IS 'Verletzungshistorie und aktueller Status';
COMMENT ON COLUMN commentator_info.fun_facts IS 'Interessante Fakten für Live-Kommentierung';
COMMENT ON COLUMN commentator_info.notes IS 'Allgemeine Notizen und Beobachtungen';
COMMENT ON COLUMN commentator_info.social_media IS 'Social Media Links (Instagram, YouTube, Website)';
COMMENT ON COLUMN commentator_info.deleted_at IS 'Zeitstempel des Soft-Delete (NULL = nicht gelöscht)';

-- Funktion für automatische Bereinigung alter gelöschter Einträge (nach 30 Tagen)
CREATE OR REPLACE FUNCTION cleanup_old_deleted_commentator_info()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM commentator_info 
  WHERE deleted_at IS NOT NULL 
  AND deleted_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optionale CRON-Job Konfiguration (falls pg_cron verfügbar)
-- SELECT cron.schedule('cleanup-deleted-commentator-info', '0 2 * * *', 'SELECT cleanup_old_deleted_commentator_info();');

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

-- INDEXES für Performance
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_login_activity_user_id ON user_login_activity(user_id);
CREATE INDEX idx_login_activity_timestamp ON user_login_activity(login_timestamp DESC);
CREATE INDEX idx_user_actions_user_id ON user_actions(user_id);
CREATE INDEX idx_user_actions_timestamp ON user_actions(timestamp DESC);

-- RLS POLICIES
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_login_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_actions ENABLE ROW LEVEL SECURITY;

-- User can view own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can update own profile
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to log user actions
CREATE OR REPLACE FUNCTION log_user_action(
  p_action_type TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_action_details JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_actions (user_id, action_type, resource_type, resource_id, action_details)
  VALUES (auth.uid(), p_action_type, p_resource_type, p_resource_id, p_action_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View for active sessions
CREATE VIEW active_sessions AS
SELECT 
  up.full_name,
  up.email,
  up.role,
  ula.login_timestamp,
  ula.ip_address,
  EXTRACT(EPOCH FROM (NOW() - ula.login_timestamp))/60 AS session_minutes
FROM user_login_activity ula
JOIN user_profiles up ON ula.user_id = up.id
WHERE ula.logout_timestamp IS NULL
  AND ula.login_timestamp > NOW() - INTERVAL '24 hours'
ORDER BY ula.login_timestamp DESC; 