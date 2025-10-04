import { useEffect, useRef, useState } from 'react'

const API_BASE = (() => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '')
  }
  return 'http://localhost:8000'
})()

const INITIAL_STATE = {
  newsSummaries: null,
  events: null,
  conferenceCalls: null
}

const NEWS_WINDOWS = [
  { key: '1d', label: 'Last 24 Hours', path: 'last-1-day', accent: 'pulse' },
  { key: '7d', label: 'Last 7 Days', path: 'last-7-days', accent: 'weekly' },
  { key: '30d', label: 'Last 30 Days', path: 'last-30-days', accent: 'monthly' }
]

function normaliseSentiment(sentiment) {
  if (!sentiment) return 'Neutral'
  const normalised = sentiment.trim().toLowerCase()
  if (normalised.includes('positive') || normalised.includes('bullish')) return 'Positive'
  if (normalised.includes('negative') || normalised.includes('bearish')) return 'Negative'
  if (normalised.includes('mixed')) return 'Mixed'
  return sentiment.charAt(0).toUpperCase() + sentiment.slice(1)
}

export function useCompanySignals(symbol, shouldFetch) {
  const [state, setState] = useState(INITIAL_STATE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    setState(INITIAL_STATE)
    setError(null)
    setLoading(false)
    fetchedRef.current = false
  }, [symbol])

  useEffect(() => {
    if (!symbol || !shouldFetch || fetchedRef.current) {
      return
    }

    let cancelled = false
    const controller = new AbortController()
    fetchedRef.current = true
    setLoading(true)
    setError(null)

    const fetchNewsWindow = async (config) => {
      const response = await fetch(`${API_BASE}/companies/${symbol}/news/${config.path}/`, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`Unable to fetch ${config.label}`)
      }
      const payload = await response.json()
      return {
        ...config,
        summary: payload?.news_summary || '',
        sentiment: normaliseSentiment(payload?.sentiment)
      }
    }

    const fetchCorporateEvents = async () => {
      const response = await fetch(`${API_BASE}/api/corporate-events/${symbol}`, { signal: controller.signal })
      if (!response.ok) {
        throw new Error('Unable to fetch corporate announcements')
      }
      const payload = await response.json()
      return Array.isArray(payload?.events) ? payload.events : []
    }

    const fetchConferenceCalls = async () => {
      try {
        // Use symbol as company_id (works for numeric symbols, and backend will handle NSE/BSE codes)
        const companyId = symbol
        
        // First get the list of available conference calls
        const detailsResponse = await fetch(`${API_BASE}/companies/${companyId}/conference-calls/details/`, { signal: controller.signal })
        if (!detailsResponse.ok) {
          // Conference calls might not be available for all companies
          return []
        }
        const detailsPayload = await detailsResponse.json()
        const calls = detailsPayload?.conference_calls || []
        
        // Fetch summaries for the most recent 3 conference calls
        const summaries = await Promise.all(
          calls.slice(0, 3).map(async (call) => {
            try {
              const summaryResponse = await fetch(
                `${API_BASE}/companies/${companyId}/conference-calls/${call.fiscal_year}/${call.fiscal_quarter}/summary/`,
                { signal: controller.signal }
              )
              if (!summaryResponse.ok) return null
              const summaryPayload = await summaryResponse.json()
              return {
                fiscal_year: call.fiscal_year,
                fiscal_quarter: call.fiscal_quarter,
                summary: summaryPayload?.summary || ''
              }
            } catch {
              return null
            }
          })
        )
        
        return summaries.filter(s => s !== null)
      } catch {
        return []
      }
    }

    const load = async () => {
      let partialErrors = []
      let newsSummaries = []
      let events = []
      let conferenceCalls = []

      const newsResults = await Promise.allSettled(NEWS_WINDOWS.map(window => fetchNewsWindow(window)))
      newsResults.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          newsSummaries.push(result.value)
        } else {
          partialErrors.push(NEWS_WINDOWS[idx].label)
        }
      })

      try {
        events = await fetchCorporateEvents()
      } catch (err) {
        partialErrors.push('Corporate Updates')
      }

      try {
        conferenceCalls = await fetchConferenceCalls()
      } catch (err) {
        // Conference calls are optional, don't add to errors
        console.log('Conference calls not available for this company')
      }

      if (cancelled) {
        return
      }

      setState({ newsSummaries, events, conferenceCalls })
      if (partialErrors.length > 0) {
        setError(`Some updates are unavailable (${partialErrors.join(', ')})`)
      }
      setLoading(false)
    }

    load().catch((err) => {
      if (cancelled || err?.name === 'AbortError') return
      setError(err.message || 'Unable to load company updates')
      setState(INITIAL_STATE)
      setLoading(false)
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [symbol, shouldFetch])

  return {
    newsSummaries: state.newsSummaries,
    events: state.events,
    conferenceCalls: state.conferenceCalls,
    loading,
    error
  }
}

export default useCompanySignals
