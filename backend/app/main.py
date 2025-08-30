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
            raw_holdings = await mcp_manager.get_holdings()
            count = len(raw_holdings) if isinstance(raw_holdings, list) else 0
            sample_keys = list(raw_holdings[0].keys()) if count else []
            print(f"[MCP][HTTP] GET /api/mcp/holdings - received {count} rows; sample columns: {sample_keys}")

            # Only expose the requested keys to the frontend
            allowed_keys = {
                "tradingsymbol",
                "price",
                "quantity",
                "t1_quantity",
                "opening_quantity",
                "average_price",
                "close_price",
                "pnl",
                "day_change",
                "day_change_percentage",
            }

            filtered: List[Dict[str, Any]] = []
            for item in (raw_holdings or []):
                if not isinstance(item, dict):
                    continue
                o: Dict[str, Any] = {k: item.get(k) for k in allowed_keys if k in item}

                # Lightweight fallbacks if upstream doesn't provide computed fields
                price = _to_num(o.get("price", item.get("last_price") or item.get("close_price")))
                close = _to_num(o.get("close_price", item.get("close_price")))
                avg = _to_num(o.get("average_price", item.get("average_price")))
                qty = _to_num(o.get("quantity", item.get("quantity")))
                # tradingsymbol fallback from common aliases
                if "tradingsymbol" not in o:
                    o["tradingsymbol"] = item.get("symbol") or item.get("ticker") or item.get("company") or "-"

                if "pnl" not in o and price is not None and avg is not None and qty is not None:
                    try:
                        o["pnl"] = (price - avg) * qty
                    except Exception:
                        pass

                if "day_change" not in o and price is not None and close is not None:
                    try:
                        o["day_change"] = price - close
                    except Exception:
                        pass

                if "day_change_percentage" not in o and close not in (None, 0):
                    try:
                        dc = o.get("day_change")
                        if dc is None and price is not None and close is not None:
                            dc = price - close
                        if dc is not None and close:
                            o["day_change_percentage"] = (dc / close) * 100
                    except Exception:
                        pass

                # Ensure numeric-like fields are numbers (not strings)
                for nk in ("price", "quantity", "t1_quantity", "opening_quantity", "average_price", "close_price", "pnl", "day_change", "day_change_percentage"):
                    if nk in o:
                        o[nk] = _to_num(o[nk])

                filtered.append(o)

            return {"holdings": filtered}
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

# Helpers
def _to_num(v: Any) -> Any:
    try:
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return v
        s = str(v).strip()
        if s == "":
            return None
        return float(s)
    except Exception:
        return v
