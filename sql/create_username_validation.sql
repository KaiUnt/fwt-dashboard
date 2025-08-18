-- Robuste Username-Validierung für FWT Dashboard
-- Diese Function wird vom validate_username_trigger aufgerufen

CREATE OR REPLACE FUNCTION "public"."check_username_validity"() 
RETURNS TRIGGER AS $$
BEGIN
    -- Prüfe ob full_name gesetzt ist
    IF NEW.full_name IS NULL OR TRIM(NEW.full_name) = '' THEN
        RAISE EXCEPTION 'Username is required and cannot be empty';
    END IF;
    
    -- Mindestlänge: 3 Zeichen (für kurze Namen wie "Max")
    IF LENGTH(TRIM(NEW.full_name)) < 3 THEN
        RAISE EXCEPTION 'Username must be at least 3 characters long';
    END IF;
    
    -- Maximallänge: 50 Zeichen (verhindert extrem lange Namen)
    IF LENGTH(TRIM(NEW.full_name)) > 50 THEN
        RAISE EXCEPTION 'Username cannot be longer than 50 characters';
    END IF;
    
    -- Erlaubte Zeichen: Buchstaben, Zahlen, Leerzeichen, Punkte, Bindestriche, Unterstriche
    -- Für echte Namen wie "Max Mustermann", "Dr. Schmidt", "Anna-Maria", etc.
    IF NEW.full_name !~ '^[a-zA-ZäöüÄÖÜß0-9\s._-]+$' THEN
        RAISE EXCEPTION 'Username can only contain letters, numbers, spaces, dots, hyphens and underscores';
    END IF;
    
    -- Verhindere nur Leerzeichen oder Sonderzeichen
    IF NEW.full_name ~ '^[\s._-]+$' THEN
        RAISE EXCEPTION 'Username must contain at least one letter or number';
    END IF;
    
    -- Verhindere führende/nachfolgende Leerzeichen
    NEW.full_name := TRIM(NEW.full_name);
    
    -- Verhindere mehrfache Leerzeichen
    NEW.full_name := REGEXP_REPLACE(NEW.full_name, '\s+', ' ', 'g');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Kommentar zur Validierung:
-- - Mindestens 3 Zeichen (für kurze echte Namen)
-- - Maximal 50 Zeichen (verhindert Spam)
-- - Erlaubt echte Namen mit Leerzeichen, Umlauten, Bindestrichen
-- - Automatische Bereinigung von Leerzeichen
-- - Verhindert reine Sonderzeichen-Namen
