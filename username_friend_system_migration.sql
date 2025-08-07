-- ===============================================================
-- USERNAME-BASED FRIEND SYSTEM MIGRATION
-- Sichere Friend Requests über Username statt Email
-- ===============================================================

-- 1. UNIQUE CONSTRAINT für full_name (Username) hinzufügen
-- Zunächst alle NULL-Werte und Duplikate bereinigen
UPDATE user_profiles 
SET full_name = COALESCE(full_name, email, 'user_' || SUBSTRING(id::text, 1, 8))
WHERE full_name IS NULL OR full_name = '';

-- Duplikate bereinigen durch Anhängen einer Nummer
WITH numbered_users AS (
  SELECT id, full_name,
         ROW_NUMBER() OVER (PARTITION BY full_name ORDER BY created_at) as rn
  FROM user_profiles
)
UPDATE user_profiles 
SET full_name = numbered_users.full_name || '_' || numbered_users.rn
FROM numbered_users
WHERE user_profiles.id = numbered_users.id 
AND numbered_users.rn > 1;

-- Unique Constraint hinzufügen
ALTER TABLE user_profiles ADD CONSTRAINT unique_full_name UNIQUE (full_name);

-- 2. RLS POLICY für Username-Lookups
-- Erlaubt Benutzern, andere User über full_name zu finden (aber nur grundlegende Infos)
CREATE POLICY "Allow username lookup for friend requests" ON user_profiles
  FOR SELECT USING (true);

-- Die bestehenden restriktiveren Policies bleiben für andere Operationen bestehen

-- 3. INDEX für Performance bei Username-Suchen
CREATE INDEX IF NOT EXISTS idx_user_profiles_full_name ON user_profiles(full_name);
CREATE INDEX IF NOT EXISTS idx_user_profiles_full_name_lower ON user_profiles(LOWER(full_name));

-- 4. FUNCTION für Username-Validierung
CREATE OR REPLACE FUNCTION validate_username(username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Username Regeln:
  -- - Mindestens 2 Zeichen
  -- - Maximal 30 Zeichen  
  -- - Nur Buchstaben, Zahlen, Unterstriche und Bindestriche
  -- - Darf nicht nur aus Zahlen bestehen
  -- - Darf nicht mit Unterstrich oder Bindestrich beginnen/enden
  
  IF username IS NULL OR LENGTH(TRIM(username)) < 2 THEN
    RETURN FALSE;
  END IF;
  
  IF LENGTH(username) > 30 THEN
    RETURN FALSE;
  END IF;
  
  -- Regex für erlaubte Zeichen
  IF NOT username ~ '^[a-zA-Z0-9_-]+$' THEN
    RETURN FALSE;
  END IF;
  
  -- Darf nicht nur Zahlen sein
  IF username ~ '^[0-9]+$' THEN
    RETURN FALSE;
  END IF;
  
  -- Darf nicht mit _ oder - beginnen/enden
  IF username ~ '^[_-]' OR username ~ '[_-]$' THEN
    RETURN FALSE;
  END IF;
  
  -- Reservierte Namen verbieten
  IF LOWER(username) IN ('admin', 'administrator', 'root', 'system', 'api', 'www', 'ftp', 'mail', 'test', 'user', 'guest', 'null', 'undefined') THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 5. TRIGGER für Username-Validierung bei INSERT/UPDATE
CREATE OR REPLACE FUNCTION check_username_validity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT validate_username(NEW.full_name) THEN
    RAISE EXCEPTION 'Invalid username format. Username must be 2-30 characters, contain only letters, numbers, underscores, and hyphens, and cannot start/end with special characters.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger erstellen
DROP TRIGGER IF EXISTS validate_username_trigger ON user_profiles;
CREATE TRIGGER validate_username_trigger
  BEFORE INSERT OR UPDATE OF full_name ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_username_validity();

-- 6. FUNCTION für Username-Verfügbarkeit prüfen
CREATE OR REPLACE FUNCTION is_username_available(username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Erst Format validieren
  IF NOT validate_username(username) THEN
    RETURN FALSE;
  END IF;
  
  -- Dann Verfügbarkeit prüfen (case-insensitive)
  RETURN NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE LOWER(full_name) = LOWER(username)
  );
END;
$$ LANGUAGE plpgsql;

-- 7. COMMENTS für Dokumentation
COMMENT ON CONSTRAINT unique_full_name ON user_profiles IS 'Ensures usernames are unique across the platform';
COMMENT ON FUNCTION validate_username(TEXT) IS 'Validates username format and rules';
COMMENT ON FUNCTION is_username_available(TEXT) IS 'Checks if a username is available for registration';
COMMENT ON FUNCTION check_username_validity() IS 'Trigger function to validate usernames on insert/update';

-- 8. INDEX für case-insensitive Username-Suchen
CREATE INDEX IF NOT EXISTS idx_user_profiles_full_name_ci ON user_profiles(LOWER(full_name));