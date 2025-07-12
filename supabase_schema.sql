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