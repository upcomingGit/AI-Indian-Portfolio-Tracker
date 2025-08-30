import asyncio
import json
import os
import re
from typing import Any, Dict, List, Optional

# Tolerate missing fastmcp at import time; raise clear error when used
try:
    from fastmcp import Client  # type: ignore
    from fastmcp.client.transports import SSETransport  # type: ignore
except Exception:  # pragma: no cover - runtime guard
    Client = None  # type: ignore
    SSETransport = None  # type: ignore


def extract_url(obj: Any) -> Optional[str]:
    """Extract the first HTTP(S) URL from various shapes returned by tools.

    Handles: string, dicts (text/message/url/data/content/structured_content),
    lists/tuples, or objects with .text/.message/.content/.data attrs.
    """
    url_pattern = re.compile(r"https?://[\w\-./?=&%:]+")
    if obj is None:
        return None

    # normalize candidates
    candidates: List[Any] = []
    if isinstance(obj, (str, bytes)):
        candidates.append(obj)
    elif isinstance(obj, dict):
        for key in ("text", "message", "url", "data", "content", "structured_content"):
            if key in obj:
                candidates.append(obj[key])
    elif isinstance(obj, (list, tuple)):
        candidates.extend(obj)
    else:
        text = getattr(obj, "text", None) or getattr(obj, "message", None)
        if text is not None:
            candidates.append(text)
        for attr in ("content", "data", "structured_content"):
            val = getattr(obj, attr, None)
            if val is not None:
                candidates.append(val)

    for c in candidates:
        try:
            if isinstance(c, (dict, list, tuple)):
                url = extract_url(c)
                if url:
                    return url
                continue
            s = c.decode() if isinstance(c, bytes) else str(c)
        except Exception:
            continue
        m = re.search(r"URL:\s*(https?://[\w\-./?=&%:]+)", s)
        if m:
            return m.group(1)
        m2 = url_pattern.search(s)
        if m2:
            return m2.group(0)
    return None


class MCPManager:
    """Keeps a persistent fastmcp Client connection and exposes login/holdings."""

    def __init__(self, sse_url: Optional[str] = None, headers: Optional[Dict[str, str]] = None):
        self.sse_url = sse_url or os.getenv("MCP_SSE_URL", "https://mcp.kite.trade/sse")
        self.headers = headers or {}
        self._client: Optional[Client] = None  # type: ignore
        self._lock = asyncio.Lock()

    async def _ensure_client(self) -> Client:
        if Client is None or SSETransport is None:  # pragma: no cover - runtime guard
            raise RuntimeError(
                "fastmcp package is not available. Please install it: pip install fastmcp"
            )

        async with self._lock:
            if self._client is not None:
                return self._client
            transport = SSETransport(url=self.sse_url, headers=self.headers or {})
            self._client = Client(transport)  # type: ignore[call-arg]
            await self._client.__aenter__()
            return self._client

    async def close(self):  # graceful shutdown
        async with self._lock:
            if self._client is not None:
                try:
                    await self._client.__aexit__(None, None, None)
                finally:
                    self._client = None

    async def get_login_url(self) -> str:
        client = await self._ensure_client()
        result = await client.call_tool("login", {})
        url = extract_url(result)
        if not url:
            raise RuntimeError("Could not extract login URL from MCP response")
        return url

    async def get_holdings(self, retries: int = 3, backoff: float = 1.5) -> List[Dict[str, Any]]:
        client = await self._ensure_client()
        attempt = 0
        last_err: Optional[Exception] = None
        while attempt < retries:
            try:
                raw = await client.call_tool("get_holdings", {})
                print(f"Raw holdings data: {raw}")
                data = await self._normalize_tool_result(raw)
                # Expect a list[dict] of holdings; tolerate dict with key
                if isinstance(data, dict) and "holdings" in data:
                    data = data["holdings"]
                if not isinstance(data, list):
                    # Return as single-item list if dict
                    data = [data] if isinstance(data, dict) else []
                return data  # type: ignore[return-value]
            except Exception as e:  # transient until login completes server-side
                last_err = e
                attempt += 1
                await asyncio.sleep(backoff ** attempt)
        raise RuntimeError(f"Failed to fetch holdings after {retries} attempts: {last_err}")

    async def _normalize_tool_result(self, raw: Any) -> Any:
        """Normalize common call_tool return shapes to plain Python values."""
        value = raw
        try:
            # Objects with .content being a list of text blocks
            if hasattr(raw, "content"):
                cont = getattr(raw, "content")
                if isinstance(cont, (list, tuple)) and cont:
                    first = cont[0]
                    text = getattr(first, "text", None) or first
                    value = text
            elif isinstance(raw, dict) and "content" in raw:
                cont = raw.get("content")
                if isinstance(cont, (list, tuple)) and cont:
                    first = cont[0]
                    value = first.get("text", first)
        except Exception:
            value = raw

        # If JSON string, parse it
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return value
        return value


# Singleton manager for app
mcp_manager = MCPManager()
