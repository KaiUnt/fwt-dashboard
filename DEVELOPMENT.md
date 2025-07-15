# FWT Dashboard - Development Guide

## 🏔️ Projekt Übersicht

Das FWT Dashboard ist ein Event-Auswahl- und Athleten-Dashboard für Freeride World Tour Moderatoren.

## 📁 Projekt Struktur

```
fwt-dashboard/
├── api/                    # LiveHeats API Integration
│   ├── client.py          # GraphQL Client
│   └── queries.py         # GraphQL Queries
├── data/                  # Datenmodelle & Verarbeitung
│   ├── models.py          # Athleten & Event Modelle
│   └── processors.py      # Daten-Transformation
├── utils/                 # Utilities
│   └── logging.py         # Logging System
├── frontend/              # Next.js Frontend
│   ├── src/
│   │   ├── app/          # App Router Pages
│   │   ├── components/   # React Components
│   │   ├── hooks/        # Custom Hooks
│   │   ├── types/        # TypeScript Definitionen
│   │   └── providers/    # Context Providers
├── backend_api.py         # FastAPI Bridge Server
├── requirements.txt       # Python Dependencies
└── start.py              # Development Startup Script
```

## 🚀 Quick Start

### Option 1: Automatisches Setup
```bash
python start.py
```

### Option 2: Manuelles Setup

#### 1. Backend API starten
```bash
# Dependencies installieren
pip install -r requirements.txt

# API Server starten
python backend_api.py
```

#### 2. Frontend starten (neues Terminal)
```bash
cd frontend
npm install
npm run dev
```

## 🔗 URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## 🛠 Entwicklungs-Workflow

### Backend API (FastAPI)
- **File**: `backend_api.py`
- **Ports**: 8000
- **Features**:
  - `/api/events` - Zukünftige FWT Events
  - `/api/events/{id}/athletes` - Athleten eines Events
  - CORS für Frontend aktiviert

### Frontend (Next.js)
- **Framework**: Next.js 15 + TypeScript
- **Styling**: Tailwind CSS
- **State**: React Query (@tanstack/react-query)
- **Icons**: Lucide React

### API Integration
- **LiveHeats API**: GraphQL Client in `api/client.py`
- **Caching**: Athleten-Details werden gecacht
- **Error Handling**: Graceful Fallbacks

## 📊 Event Auswahl Features

✅ **Implemented:**
- Event-Liste mit Suchfunktion
- Jahr-basierte Filterung  
- Event-Typ Erkennung (Pro/Challenger/Junior)
- Responsive Design
- Loading & Error States
- Event-Details (Name, Datum, Location)

🚧 **Next Steps:**
- Dashboard für ausgewählte Events
- Athleten-Navigation
- Annotations System

## 🎯 API Endpoints

### GET `/api/events`
Zukünftige FWT Events abrufen

**Response:**
```json
{
  "events": [
    {
      "id": "event_id",
      "name": "Event Name",
      "date": "2024-12-20T10:00:00Z",
      "formatted_date": "20.12.2024",
      "location": "Chamonix, France",
      "year": 2024
    }
  ],
  "total": 5,
  "message": "Found 5 future events"
}
```

### GET `/api/events/{event_id}/athletes`
Athleten für ein spezifisches Event

## 🔧 Development Tips

### Backend Debugging
```python
# Logging aktivieren in client.py
from utils.logging import get_logger
logger = get_logger(__name__, "DEBUG")
```

### Frontend Development
```bash
# TypeScript Check
npm run build

# Linting
npm run lint
```

### API Testing
```bash
# Test Events Endpoint
curl http://localhost:8000/api/events

# Test mit jq (JSON Parser)
curl -s http://localhost:8000/api/events | jq '.events[0]'
```

## 🐛 Troubleshooting

### PowerShell Execution Policy
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Port bereits in Verwendung
```bash
# Backend (Port 8000)
lsof -ti:8000 | xargs kill -9

# Frontend (Port 3000)  
lsof -ti:3000 | xargs kill -9
```

### Dependencies Issues
```bash
# Python Dependencies neu installieren
pip install --upgrade -r requirements.txt

# Node Dependencies neu installieren
cd frontend && rm -rf node_modules package-lock.json && npm install
```

## 📈 Performance

- **Initial Load**: 3-10 Sekunden (LiveHeats API)
- **Navigation**: <100ms (Client-side)  
- **Search**: Instant (Client-side filtering)
- **Caching**: 5 Minuten (React Query)

## 🔄 Next Development Phase

Nach der Event-Auswahl folgt **Phase 1 MVP** aus der `readme.md`:
1. Dashboard für ausgewähltes Event
2. Athleten-Navigation mit BIB-Nummern
3. Keyboard Shortcuts
4. Quick Search & Jump Funktionen 