import { useEffect, useRef, useState } from 'react'

// Simple in-memory cache (symbol -> { data, timestamp })
const MEMORY_CACHE = new Map()
const STALE_MS = 5 * 60 * 1000 // 5 minutes

function loadFromStorage(symbol) {
  try {
    const raw = localStorage.getItem(`companyAnalysis:${symbol}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveToStorage(symbol, payload) {
  try { localStorage.setItem(`companyAnalysis:${symbol}`, JSON.stringify(payload)) } catch {}
}

export function useCompanyAnalysis(symbol) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!!symbol)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    const now = Date.now()

    // Memory cache first
    const mem = MEMORY_CACHE.get(symbol)
    if (mem) {
      setData(mem.data)
      setLoading(false)
      if (now - mem.timestamp < STALE_MS) return () => { cancelled = true }
    } else {
      // LocalStorage cache
      const stored = loadFromStorage(symbol)
      if (stored) {
        setData(stored.data)
        setLoading(false)
        if (now - stored.timestamp < STALE_MS) return () => { cancelled = true }
      }
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(prev => !data || prev)

    fetch(`http://localhost:8000/api/thesis/${symbol}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Failed to fetch analysis'); return r.json() })
      .then(json => {
        if (cancelled) return
        const payload = { data: json, timestamp: Date.now() }
        MEMORY_CACHE.set(symbol, payload)
        saveToStorage(symbol, payload)
        setData(json)
        setError(null)
      })
      .catch(err => { if (!cancelled && err.name !== 'AbortError') setError(err.message || 'Unknown error') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true; controller.abort() }
  }, [symbol])

  return { data, loading, error }
}

export default useCompanyAnalysis
