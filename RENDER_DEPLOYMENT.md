# Render.com Deployment Guide für FWT Dashboard

## 🚀 Deployment Konfiguration

### Backend Service
```
Environment: Production
Build Command: pip install -r requirements.txt
Start Command: uvicorn backend_api:app --host 0.0.0.0 --port $PORT --workers 1
```

### Python Version
**WICHTIG:** Python 3.11.9 verwenden (nicht 3.13!)
- Grund: pydantic 1.x + fastapi 0.104.x sind nicht kompatibel mit Python 3.13
- Lösung: `runtime.txt` und `.python-version` Dateien setzen Version

### Environment Variable
```
ENVIRONMENT=production
BASIC_AUTH_USER=admin
BASIC_AUTH_PASSWORD=your-secure-password
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-key
ALLOWED_ORIGINS=https://your-frontend-domain.onrender.com
```

### Frontend Service
```
Environment: Production
Build Command: cd frontend && npm install && npm run build
Start Command: cd frontend && npm start
```

## 🔧 Troubleshooting

### Python 3.13 ForwardRef Error
**Symptom:** `ForwardRef._evaluate() missing 1 required keyword-only argument: 'recursive_guard'`
**Solution:** Downgrade zu Python 3.11.9 via `runtime.txt`

### React 19 Testing Dependencies Conflict
**Symptom:** `npm error ERESOLVE unable to resolve dependency tree`
**Solution:** Testing dependencies aus package.json entfernt (production build)

### Pydantic Rust Compilation Error
**Symptom:** `maturin failed`, `Cargo metadata failed`
**Solution:** pydantic==1.10.12 (pure Python, no Rust)

## ✅ Verified Working Configuration
- Python: 3.11.9
- pydantic: 1.10.12 (no Rust)
- fastapi: 0.104.1
- React: 19.0.0 (no testing deps)
- Next.js: 15.3.5