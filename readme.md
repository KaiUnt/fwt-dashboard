# FWT Dashboard 🏔️

A professional event management tool for Freeride World Tour commentators, built with Next.js and FastAPI.

## Features ✨

### Event Management
- **Single Event Dashboard**: View athletes for individual FWT events
- **Multi-Event Support**: Compare athletes across multiple events (e.g., Challenger + Junior)
- **Real-time Data**: Live integration with LiveHeats API
- **Fast Navigation**: Keyboard shortcuts and BIB jumping


### Athlete Information
- **Comprehensive Profiles**: Complete athlete data from LiveHeats
- **Event History**: Location-based historical performance tracking
- **Commentator Annotations**: Add custom notes and information (optional Supabase integration)
- **Series Rankings**: Complete FWT/FWQ series standings and results

### Location Intelligence
- **Smart Event Matching**: 169+ location database for accurate event history
- **Career Progression**: Track athletes from Junior → FWQ → Challenger → Pro
- **Location-Based History**: See all athlete performances at specific venues

## Quick Start 🚀

### Prerequisites
- Python 3.8+
- Node.js 18+
- Git

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/KaiUnt/fwt-dashboard.git
cd fwt-dashboard
```

2. **Install dependencies**
```bash
# Python backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
cd ..
```

3. **Start the application**
```bash
# Start both frontend and backend
python start.py
```

4. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Usage 📖

### Basic Navigation
- Browse upcoming FWT events on the home page
- Click on an event to view the athlete dashboard
- Use keyboard shortcuts: `←/→` to navigate between athletes
- Press numbers to jump to specific BIB numbers
- Use `/` to search for athletes by name

### Multi-Event Dashboard
- Select multiple events for combined viewing
- Perfect for events with both Challenger and Junior competitions
- Athletes are automatically merged and sorted

### Event History
The dashboard shows historical performance for each athlete at the same location:
- **Junior Championships** (early career)
- **FWQ Qualifiers** (qualification events) 
- **FWT Challengers** (challenger series)
- **FWT Pro Events** (main tour)

This gives commentators complete context about athlete progression and venue experience.

## Architecture 🏗️

### Frontend (Next.js 15)
- **App Router** with TypeScript
- **Tailwind CSS** for styling
- **React Query** for data caching
- **Responsive design** optimized for tablets and desktops

### Backend (FastAPI)
- **GraphQL client** for LiveHeats API integration
- **CORS enabled** for frontend communication
- **Automatic caching** for improved performance
- **RESTful endpoints** for all data access
- **JWT Authentication** for secure API access (91.3% endpoint coverage)

### Optional Features
- **Supabase integration** for commentator annotations
- **Offline support** with local storage
- **PWA capabilities** for mobile use

## API Endpoints 🔌

### Authentication
All API endpoints (except `/health` and `/`) require JWT authentication via `Authorization: Bearer <token>` header.

### Events
- `GET /api/events` - List upcoming FWT events 🔒
- `GET /api/events/{id}/athletes` - Get athletes for specific event 🔒

### Series Rankings
- `GET /api/series/rankings/{eventId}` - Get series rankings and historical data 🔒
- `GET /api/fullresults` - Complete FWT series data 🔒
- `GET /api/fullresults/{series_id}` - Specific series rankings 🔒

### Commentator Info (Optional)
- `POST /api/commentator-info` - Save commentator annotations 🔒
- `GET /api/commentator-info/export` - Export all commentator data 🔒
- Requires Supabase configuration and user authentication

### Public Endpoints
- `GET /` - API status (public)
- `GET /health` - Health check (public)

## Configuration ⚙️

### Environment Variables (Optional)
```bash
# For commentator annotations feature
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
```

### Development Commands
```bash
# Backend only
python backend_api.py

# Frontend only
cd frontend && npm run dev

# Build for production
cd frontend && npm run build

# Linting
cd frontend && npm run lint
```

## Performance 📊

- **Initial Load**: 3-10 seconds (depends on LiveHeats API)
- **Navigation**: <100ms (client-side caching)
- **Search**: Instant (client-side filtering)
- **Data Updates**: Cached for 5 minutes

## Troubleshooting 🔧

### Common Issues

**Port Conflicts**
- Backend runs on port 8000
- Frontend runs on port 3000
- Make sure these ports are available

**PowerShell Execution Policy (Windows)**
```powershell
Set-ExecutionPolicy RemoteSigned
```

**Dependency Issues**
```bash
pip install --upgrade -r requirements.txt
npm install --force
```

## Contributing 🤝

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support 📞

For issues or questions:
1. Check the troubleshooting section
2. Review API documentation at http://localhost:8000/docs
3. Create an issue on GitHub

## License 📄

This project is built for the Freeride World Tour community.

---

**Built with ❤️ for FWT commentators**