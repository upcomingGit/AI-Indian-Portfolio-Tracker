import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List

from mcp_manager import mcp_manager


class HoldingsResponse(BaseModel):
    holdings: List[Dict[str, Any]]


def create_app() -> FastAPI:
    app = FastAPI(title="InvestR MCP Bridge", version="0.1.0")

    # CORS: allow local frontend and simple cross-origin calls
    frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_origin, "*"],  # allow all for dev simplicity
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def log_requests(request, call_next):
        try:
            print(f"[MCP][HTTP][REQ] {request.method} {request.url.path}")
        except Exception:
            pass
        response = await call_next(request)
        try:
            print(f"[MCP][HTTP][RES] {request.method} {request.url.path} -> {response.status_code}")
        except Exception:
            pass
        return response

    # Basic startup/shutdown diagnostics
    @app.on_event("startup")
    async def on_startup():
        print("[MCP][STARTUP] FastAPI app started.")
        print(f"[MCP][STARTUP] FRONTEND_ORIGIN={frontend_origin}")
        try:
            print(f"[MCP][STARTUP] MCP SSE URL={getattr(mcp_manager, 'sse_url', 'unknown')}")
        except Exception as e:
            print(f"[MCP][STARTUP] Unable to read MCP manager details: {e}")

    @app.get("/api/mcp/login")
    async def mcp_login():
        try:
            print("[MCP][HTTP] GET /api/mcp/login - requesting login URL...")
            url = await mcp_manager.get_login_url()
            print(f"[MCP][HTTP] GET /api/mcp/login - obtained URL: {url}")
            return {"login_url": url}
        except Exception as e:
            print(f"[MCP][HTTP][ERROR] /api/mcp/login failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/mcp/holdings", response_model=HoldingsResponse)
    async def mcp_holdings():
        try:
            print("[MCP][HTTP] GET /api/mcp/holdings - fetching holdings...")
            holdings = await mcp_manager.get_holdings()
            count = len(holdings) if isinstance(holdings, list) else 0
            sample_keys = list(holdings[0].keys()) if count else []
            print(f"[MCP][HTTP] GET /api/mcp/holdings - received {count} rows; sample columns: {sample_keys}")
            return {"holdings": holdings}
        except Exception as e:
            print(f"[MCP][HTTP][ERROR] /api/mcp/holdings failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.on_event("shutdown")
    async def on_shutdown():
        print("[MCP][SHUTDOWN] Closing MCP manager client...")
        try:
            await mcp_manager.close()
            print("[MCP][SHUTDOWN] Closed.")
        except Exception as e:
            print(f"[MCP][SHUTDOWN][ERROR] Error during shutdown: {e}")

    return app


app = create_app()
