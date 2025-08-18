-- ===============================================================
-- FRIENDS SYSTEM SCHEMA für FWT Dashboard
-- User Connection und Friend Request Management
-- ===============================================================

-- 1. USER CONNECTIONS TABLE für Friend Requests und Freundschaften
CREATE TABLE IF NOT EXISTS user_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  addressee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique constraint - no duplicate connections between same users
  UNIQUE(requester_id, addressee_id)
);

-- 2. INDEXES für Performance
CREATE INDEX IF NOT EXISTS idx_user_connections_requester ON user_connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_user_connections_addressee ON user_connections(addressee_id);
CREATE INDEX IF NOT EXISTS idx_user_connections_status ON user_connections(status);
CREATE INDEX IF NOT EXISTS idx_user_connections_created_at ON user_connections(created_at DESC);

-- 3. FUNCTION für automatische Zeitstempel-Updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. TRIGGER für automatische updated_at Updates
DROP TRIGGER IF EXISTS update_user_connections_updated_at ON user_connections;
CREATE TRIGGER update_user_connections_updated_at
    BEFORE UPDATE ON user_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS POLICIES für Row Level Security
ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;

-- Users can view connections where they are involved (as requester or addressee)
CREATE POLICY "Users can view own connections" ON user_connections
  FOR SELECT USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );

-- Users can create friend requests (as requester)
CREATE POLICY "Users can create friend requests" ON user_connections
  FOR INSERT WITH CHECK (
    auth.uid() = requester_id
  );

-- Users can update connections where they are the addressee (accept/decline)
-- OR where they are the requester (to cancel pending requests)
CREATE POLICY "Users can update own connections" ON user_connections
  FOR UPDATE USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );

-- Users can delete connections where they are involved
CREATE POLICY "Users can delete own connections" ON user_connections
  FOR DELETE USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );

-- Admins can view all connections
CREATE POLICY "Admins can view all connections" ON user_connections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 6. COMMENTS für Dokumentation
COMMENT ON TABLE user_connections IS 'Friend connections and requests between users';
COMMENT ON COLUMN user_connections.requester_id IS 'User who sent the friend request';
COMMENT ON COLUMN user_connections.addressee_id IS 'User who received the friend request';
COMMENT ON COLUMN user_connections.status IS 'Status: pending, accepted, declined';
COMMENT ON COLUMN user_connections.created_at IS 'When the friend request was created';
COMMENT ON COLUMN user_connections.updated_at IS 'When the status was last updated';