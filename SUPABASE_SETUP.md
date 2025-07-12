# Supabase Setup für Kommentatoren-Infos

## 🚀 Schnellstart

### 1. Supabase Konto erstellen
- Gehe zu [https://supabase.com](https://supabase.com)
- Erstelle ein kostenloses Konto
- Erstelle ein neues Projekt

### 2. Umgebungsvariablen konfigurieren
Erstelle eine `.env` Datei im Projektroot:

```bash
# .env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

**Werte findest du in deinem Supabase-Projekt:**
- Settings → API → Project URL
- Settings → API → Project API keys → anon public

### 3. Datenbank Schema erstellen
- Gehe zu deinem Supabase-Dashboard
- Klicke auf "SQL Editor"
- Kopiere den Inhalt von `supabase_schema.sql` und führe ihn aus

### 4. Dependencies installieren
```bash
pip install supabase==2.3.4
```

### 5. Server neu starten
```bash
python backend_api.py
```

## 🔧 Funktionsweise

### API Endpoints
- `GET /api/commentator-info/{athlete_id}` - Infos abrufen
- `POST /api/commentator-info` - Infos erstellen
- `PUT /api/commentator-info/{athlete_id}` - Infos aktualisieren
- `DELETE /api/commentator-info/{athlete_id}` - Infos löschen

### Felder
- **Homebase**: Heimatort des Athleten
- **Team**: Aktuelles Team
- **Sponsoren**: Liste der Sponsoren
- **Lieblingstrick**: Signature Move
- **Achievements**: Karriere-Highlights
- **Verletzungen**: Verletzungshistorie/Status
- **Fun Facts**: Stories für Live-Kommentierung
- **Notizen**: Allgemeine Kommentare
- **Social Media**: Instagram, YouTube, Website

## 🏔️ Offline-First

Das System funktioniert auch offline:
- Änderungen werden lokal gespeichert
- Automatische Synchronisation wenn wieder online
- Keine Datenverluste

## 🔒 Sicherheit

- Row Level Security (RLS) ist aktiviert
- Aktuell: Vollzugriff für alle (für Entwicklung)
- Für Produktion: Erweiterte Berechtigungen implementieren

## 🆘 Troubleshooting

### "Supabase not configured" Fehler
- Überprüfe die `.env` Datei
- Stelle sicher, dass die Umgebungsvariablen korrekt sind
- Starte den Server neu

### Keine Daten werden gespeichert
- Überprüfe die Datenbank-Verbindung
- Kontrolliere die RLS-Policies
- Schaue in die Server-Logs

### Schema-Fehler
- Führe `supabase_schema.sql` erneut aus
- Überprüfe die Tabellen-Struktur in Supabase

## 📞 Support

Bei Problemen:
1. Überprüfe die Server-Logs
2. Teste die API-Endpoints direkt
3. Kontrolliere die Supabase-Dashboard-Logs 