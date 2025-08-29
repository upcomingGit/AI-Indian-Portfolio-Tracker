# InvestR Backend (FastAPI + MCP bridge)

This service exposes two endpoints for the frontend to trigger the Zerodha MCP login and fetch holdings.

- GET /api/mcp/login -> { login_url }
- GET /api/mcp/holdings -> { holdings: [...] }

## Run locally

1. Create a venv and install deps:

```powershell
python -m venv .venv
. .venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

2. Start the server:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

3. Frontend should call the endpoints via a dev proxy (see below) or adjust the base URL accordingly.

## Frontend proxy (Vite)

If running backend on port 8000, add a Vite proxy in `frontend/vite.config.js`:

```js
server: { proxy: { '/api': 'http://localhost:8000' } }
```

Set FRONTEND_ORIGIN env if needed for CORS.

## Production

Mount `app.main:app` under your chosen ASGI server (Uvicorn/Gunicorn) and ensure environment has `fastmcp` configured network access to `https://mcp.kite.trade/sse`.