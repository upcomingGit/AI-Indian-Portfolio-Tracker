import os
import asyncio
import requests
import re
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from mcp_manager import mcp_manager

API_URL_LOOKUP = "https://api.bseindia.com/BseIndiaAPI/api/PeerSmartSearch/w"
API_URL_ANNOUNCEMENTS = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w"


class HoldingsResponse(BaseModel):
    holdings: List[Dict[str, Any]]


class CorporateEventsResponse(BaseModel):
    events: List[Dict[str, Any]]


def lookup_scrip(scrip):
    """Return scrip name if scrip is a BSE scrip code, or scrip code if name is given. Also parses and returns the BSE code if found."""
    params = {"Type": "SS", "text": scrip}
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.bseindia.com/",
        "Referer": "https://www.bseindia.com/",
        "Connection": "keep-alive",
    }
    response = requests.get(API_URL_LOOKUP, params=params, headers=headers, timeout=10)
    print(f"Raw Response: {response.text}")
    response.raise_for_status()
    html = response.text.replace("&nbsp;", " ")
    # Try to extract the BSE code (last number in the <li> element)
    match = re.search(r"liclick\('([0-9]+)'", html)
    bse_code = match.group(1) if match else None
    return {"html": html, "bse_code": bse_code}


def get_segment_code(segment):
    """Convert segment name to BSE API code"""
    if segment == "equity":
        return "C"
    elif segment == "debt":
        return "D"
    elif segment == "mf_etf":
        return "M"
    else:
        return "C"  # Default to equity


async def fetch_bse_announcements(symbol: str, from_date: datetime, to_date: datetime) -> List[Dict[str, Any]]:
    """
    Fetch corporate announcements from BSE API for a given symbol
    """
    try:
        # Use the lookup_scrip function to get BSE code dynamically
        print(f"[BSE API] Looking up BSE code for symbol: {symbol}")
        lookup_result = lookup_scrip(symbol)
        scrip_code = lookup_result.get("bse_code")
        
        # If no scrip code found, return placeholder data
        if not scrip_code:
            print(f"[BSE API] No BSE code found for symbol: {symbol}")
            return [
                {
                    "id": 1,
                    "event_type": "General Announcement",
                    "description": f"Corporate announcements for {symbol} will be available soon",
                    "event_date": datetime.now().strftime("%Y-%m-%d"),
                    "source": "BSE",
                    "category": "General"
                }
            ]
        
        print(f"[BSE API] Found BSE code {scrip_code} for symbol {symbol}")
        
        params = {
            "pageno": 1,
            "strCat": "-1",  # All categories
            "subcategory": "-1",  # All subcategories
            "strPrevDate": from_date.strftime("%Y%m%d"),
            "strToDate": to_date.strftime("%Y%m%d"),
            "strSearch": "P",
            "strscrip": scrip_code,
            "strType": get_segment_code("equity"),
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://www.bseindia.com/",
            "Referer": "https://www.bseindia.com/",
            "Connection": "keep-alive",
        }
        
        # Make async request using requests (in production, use aiohttp)
        import asyncio
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, 
            lambda: requests.get(API_URL_ANNOUNCEMENTS, params=params, headers=headers, timeout=10)
        )
        
        if response.status_code != 200:
            raise Exception(f"BSE API returned status {response.status_code}")
            
        data = response.json()
        
        # Parse and format the response
        events = []
        if isinstance(data, dict) and "Table" in data:
            for item in data["Table"]:
                # Parse the date properly - BSE returns datetime like "2025-09-01T11:01:17.15"
                event_date = item.get("DT_TM", datetime.now().isoformat())
                try:
                    # Convert BSE datetime format to simple date
                    if 'T' in event_date:
                        event_date = event_date.split('T')[0]
                except:
                    event_date = datetime.now().strftime("%Y-%m-%d")
                
                event = {
                    "id": len(events) + 1,
                    "event_type": item.get("CATEGORYNAME", "General Announcement"),
                    "description": item.get("HEADLINE", "Corporate announcement"),
                    "event_date": event_date,
                    "source": "BSE",
                    "category": item.get("CATEGORYNAME", "General"),
                    "subcategory": item.get("SUBCATNAME", ""),
                    "url": item.get("NSURL", ""),
                    "attachment_url": item.get("ATTACHMENTNAME", ""),
                    # Additional fields that might be useful for frontend display
                    "scrip_code": item.get("SCRIP_CD", ""),
                    "company_name": item.get("SLONGNAME", ""),
                    "news_id": item.get("NEWSID", ""),
                    "dissemination_time": item.get("DissemDT", ""),
                    "announcement_type": item.get("ANNOUNCEMENT_TYPE", "")
                }
                events.append(event)
        
        return events if events else [
            {
                "id": 1,
                "event_type": "No Events",
                "description": f"No corporate announcements found for {symbol} in the selected timeframe",
                "event_date": datetime.now().strftime("%Y-%m-%d"),
                "source": "BSE",
                "category": "General"
            }
        ]
        
    except Exception as e:
        print(f"[BSE API][ERROR] Failed to fetch announcements for {symbol}: {e}")
        # Return placeholder data on error
        return [
            {
                "id": 1,
                "event_type": "Error",
                "description": f"Unable to fetch corporate events for {symbol} at this time",
                "event_date": datetime.now().strftime("%Y-%m-%d"),
                "source": "System",
                "category": "Error"
            }
        ]


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

    # Initialize in-memory cache
    app.state.holdings_cache = None  # type: ignore[attr-defined]
    app.state.holdings_cache_ts = None  # type: ignore[attr-defined]
    app.state.holdings_cache_lock = asyncio.Lock()  # type: ignore[attr-defined]

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
    async def mcp_holdings(refresh: bool = False):
        try:
            print(f"[MCP][HTTP] GET /api/mcp/holdings - refresh={refresh}")

            # If not forcing refresh and cache exists, serve cached
            try:
                if not refresh and getattr(app.state, "holdings_cache", None) is not None:  # type: ignore[attr-defined]
                    cached = app.state.holdings_cache  # type: ignore[attr-defined]
                    print("[MCP][CACHE] Returning cached holdings")
                    return {"holdings": cached}
            except Exception:
                pass

            # Otherwise, fetch fresh from MCP and update cache
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

            # Save to cache
            try:
                async with app.state.holdings_cache_lock:  # type: ignore[attr-defined]
                    app.state.holdings_cache = filtered  # type: ignore[attr-defined]
            except Exception:
                pass

            return {"holdings": filtered}
        except Exception as e:
            print(f"[MCP][HTTP][ERROR] /api/mcp/holdings failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/corporate-events/{symbol}", response_model=CorporateEventsResponse)
    async def get_corporate_events(symbol: str, filter_type: str = "30"):
        """
        Fetch corporate events/announcements for a given symbol.
        filter_type: "30" for last 30 days, "all" for all available events
        """
        try:
            print(f"[API][HTTP] GET /api/corporate-events/{symbol} - filter={filter_type}")
            
            # Determine date range
            if filter_type == "all":
                # Get events from last 1 year
                from_date = datetime.now() - timedelta(days=365)
                to_date = datetime.now()
            else:
                # Default to last 30 days
                days = int(filter_type) if filter_type.isdigit() else 30
                from_date = datetime.now() - timedelta(days=days)
                to_date = datetime.now()
            
            events = await fetch_bse_announcements(symbol, from_date, to_date)
            
            print(f"[API][HTTP] GET /api/corporate-events/{symbol} - received {len(events)} events")
            return {"events": events}
            
        except Exception as e:
            print(f"[API][HTTP][ERROR] /api/corporate-events/{symbol} failed: {e}")
            # Return empty events instead of error to avoid breaking frontend
            return {"events": []}

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
