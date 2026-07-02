# Production Deployment Guide

This MVP is local-first. For production, treat it as a private user-data system.

## Recommended Hardening

- Replace plain local password comparison with a hashed password.
- Use per-client scoped API keys.
- Add rate limits and audit logs.
- Encrypt SQLite backups and exports.
- Put the backend behind HTTPS.
- Restrict CORS to trusted dashboard origins.
- Use a persistent volume for `/app/data`.
- Pin dependency versions and scan images.
- Pre-download or bundle the embedding model to avoid first-start surprises.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Services:

- Backend API: `http://localhost:8000`
- Dashboard: `http://localhost:5173`
- MCP server: stdio process inside container, mainly useful as a build target

## Local Non-Docker

```powershell
cd backend
$env:EMBEDDING_MODE="hash"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
cd frontend
$env:VITE_API_URL="http://localhost:8000"
npm.cmd run dev -- --host 127.0.0.1 --port 8081
```

## Browser Extension

Load `browser_extension/` as an unpacked Chrome extension. The extension only captures the current page when the user clicks "Save current chat".

For packaged distribution, generate a stable extension ID and add that origin to backend CORS. During local development, the backend allows `chrome-extension://.*`.
