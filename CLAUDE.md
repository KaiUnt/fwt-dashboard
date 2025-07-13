# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FWT Dashboard is a Freeride World Tour event management tool for commentators, built with Next.js frontend and FastAPI backend. The application provides event selection, athlete dashboards with navigation, and commentator annotations system.

## Development Commands

### Full Stack Development
```bash
# Start both frontend and backend servers
python start.py
```

### Backend (FastAPI)
```bash
# Install Python dependencies
pip install -r requirements.txt

# Start backend API server on port 8000
python backend_api.py

# API documentation available at http://localhost:8000/docs
```

### Frontend (Next.js)
```bash
cd frontend

# Install dependencies
npm install

# Development server on port 3000 with Turbopack
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint
```

## Architecture Overview

### Backend Structure
- **FastAPI Bridge**: `backend_api.py` - Main API server with CORS enabled
- **LiveHeats Integration**: `api/client.py` - GraphQL client for external API
- **Data Models**: `data/models.py` - Athlete and event data structures
- **Supabase Integration**: Commentator annotations with optional credentials

### Frontend Structure
- **Next.js 15**: App Router with TypeScript and Tailwind CSS
- **State Management**: React Query (@tanstack/react-query) for caching
- **Components**: Modular React components in `src/components/`
- **Custom Hooks**: Data fetching and state management in `src/hooks/`
- **Routing**: App router with dynamic event pages `/dashboard/[eventId]`

### Key API Endpoints
- `GET /api/events` - Future FWT events with filtering
- `GET /api/events/{id}/athletes` - Athletes for specific event
- `POST /api/commentator-info` - Create/update athlete annotations (requires Supabase)

### Data Flow
1. **LiveHeats API** → GraphQL queries for event/athlete data
2. **FastAPI Backend** → Caches and serves data to frontend
3. **Next.js Frontend** → React Query for client-side caching
4. **Supabase** → Optional annotations storage for commentator info

## Environment Requirements

### Required Environment Variables (Optional Features)
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
```

### URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Development Patterns

### Component Structure
- Use TypeScript with proper typing from `src/types/`
- Follow existing patterns in `src/components/` for consistency
- Implement loading states and error handling
- Use Lucide React for icons

### API Integration
- Backend uses `api/client.py` for LiveHeats GraphQL queries
- Frontend uses React Query hooks in `src/hooks/` for data fetching
- Implement proper error boundaries and loading states

### Styling
- Tailwind CSS with German language layout (`lang="de"`)
- Inter font for UI, JetBrains Mono for code/data
- Responsive design patterns

## Testing Commands

```bash
# TypeScript compilation check
cd frontend && npm run build

# Linting
cd frontend && npm run lint

# Manual API testing
curl http://localhost:8000/api/events
```

## Troubleshooting

### Common Issues
- **Port conflicts**: Backend (8000), Frontend (3000)
- **PowerShell execution policy**: May need `Set-ExecutionPolicy RemoteSigned`
- **Dependencies**: Use `pip install --upgrade -r requirements.txt` for Python packages

### Performance Notes
- Initial load: 3-10 seconds (LiveHeats API dependency)
- Navigation: <100ms (client-side caching)
- React Query cache: 5 minutes default