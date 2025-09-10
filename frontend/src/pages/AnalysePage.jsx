import { useState, useEffect } from 'react'
// MOCK DATA IMPORT (kept as fallback)
import mockMd from '../mock/portfolioTable.md?raw'

export default function AnalysePage({ onBack, onCompanySelect, portfolioLoaded = false, setPortfolioLoaded = () => {}, portfolioData = null, setPortfolioData = () => {} }) {
  const [tableHtml, setTableHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [newsSummaries, setNewsSummaries] = useState([])
  const [newsFilter, setNewsFilter] = useState(7) // days
  const [tickers, setTickers] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsError, setNewsError] = useState('')
  const [holdings, setHoldings] = useState([])
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 560)

  console.log('AnalysePage render:', { portfolioLoaded, hasPortfolioData: !!portfolioData, holdingsLength: holdings.length, tableHtml: !!tableHtml })

  // API base for news + sentiment
  const API_BASE = import.meta.env.VITE_API_BASE

  // Track viewport for responsive alternate layout (lightweight, throttled by resize events)
  useEffect(() => {
    const handler = () => {
      // Avoid state churn if value unchanged
      const mobile = window.innerWidth < 560
      setIsMobile(prev => prev !== mobile ? mobile : prev)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Load cached portfolio data on mount or when portfolio state changes
  useEffect(() => {
    if (portfolioLoaded && portfolioData && holdings.length === 0 && !tableHtml) {
      console.log('Loading cached portfolio data:', portfolioData)
      setHoldings(portfolioData.holdings || [])
      setTickers(portfolioData.tickers || [])
      setTableHtml(portfolioData.tableHtml || '')
    }
  }, [portfolioLoaded, portfolioData]) // Run when portfolio state changes

  // HELPER: converts a markdown table into HTML. You can keep this helper when
  // replacing mock data (call it with server-provided markdown), or remove it
  // if you receive HTML from the backend.
  const parseMarkdownTableToHtml = (md) => {
    const lines = md.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length < 3) return ''
    const header = lines[0]
    const rows = lines.slice(2) // skip separator
    const headers = header.split('|').map(s => s.trim()).filter(Boolean)
    const trs = rows.map(r => {
      const cols = r.split('|').map(s => s.trim()).filter(Boolean)
      const tds = cols.map((c, i) => `<td data-col=\"${headers[i] || ''}\">${c}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('')
    const ths = headers.map(h => `<th>${h}</th>`).join('')
    return `<table class=\"portfolio-table\"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
  }

  // Helper: build simple HTML table from list of dict holdings
  const holdingsToHtml = (items) => {
    if (!Array.isArray(items) || items.length === 0) return ''
    // collect headers across all items
    const headersSet = new Set()
    items.forEach(it => Object.keys(it || {}).forEach(k => headersSet.add(k)))
    const headers = Array.from(headersSet)
    const ths = headers.map(h => `<th>${h}</th>`).join('')
    const trs = items.map((it, idx) => {
      const tds = headers.map(h => `<td data-col=\"${h}\">${it?.[h] ?? ''}</td>`).join('')
      return `<tr data-row=\"${idx}\">${tds}</tr>`
    }).join('')
    return `<table class=\"portfolio-table\"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
  }

  // Formatting helpers
  const fmtNum = (n, digits = 2) => {
    if (n === null || n === undefined || isNaN(n)) return '-'
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })
  }
  const fmtPct = (n) => (n === null || n === undefined || isNaN(n) ? '-' : `${fmtNum(n, 2)}%`)

  const deriveRow = (h) => {
    const price = Number(h?.price ?? h?.last_price ?? h?.close_price ?? 0)
    const qty = Number(h?.quantity ?? 0)
    const avg = Number(h?.average_price ?? 0)
    const close = Number(h?.close_price ?? price)
    const dayChange = h?.day_change !== undefined ? Number(h.day_change) : (price - close)
    const dayChangePct = h?.day_change_percentage !== undefined
      ? Number(h.day_change_percentage)
      : (close ? ((dayChange / close) * 100) : 0)
    const pnl = h?.pnl !== undefined ? Number(h.pnl) : ((price - avg) * qty)
    return {
      tradingsymbol: h?.tradingsymbol ?? h?.symbol ?? h?.ticker ?? '-',
      price,
      quantity: qty,
      t1_quantity: Number(h?.t1_quantity ?? h?.t1Quantity ?? 0),
      opening_quantity: Number(h?.opening_quantity ?? h?.openingQuantity ?? 0),
      average_price: avg,
      close_price: close,
      pnl,
      day_change: dayChange,
      day_change_percentage: dayChangePct,
    }
  }

  // timeframe -> API path segment
  const timeframePath = (days) => {
    if (days === 1) return 'last-1-day'
    if (days === 7) return 'last-7-days'
    return 'last-30-days'
  }

  // normalize sentiment text from API
  const normalizeSentiment = (s) => {
    if (!s) return 'Neutral'
    const v = String(s).toLowerCase()
    if (v.startsWith('pos')) return 'Positive'
    if (v.startsWith('neg')) return 'Negative'
    if (v.startsWith('neu')) return 'Neutral'
    return 'Neutral'
  }

  // Add newlines between bullet points for better readability
  const formatBulletPoints = (text) => {
    if (!text) return ''
    // Add newlines before bullet points (hyphens or asterisks)
    return text.replace(/^\s*([-*])\s*/gm, '\n$1 ')
  }

  // Fetch news+sentiment for provided tickers and timeframe
  const fetchNews = async (days, symbols) => {
    const list = symbols && symbols.length ? symbols : tickers
    if (!list.length) {
      setNewsSummaries([])
      return
    }
    setNewsLoading(true)
    setNewsError('')
    try {
      const pathSeg = timeframePath(days)
      const results = await Promise.all(list.map(async (t) => {
        const url = `${API_BASE}/companies/${encodeURIComponent(t)}/news/${pathSeg}/`
        try {
          console.log('[News API] GET', url)
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          console.log('[News API] OK', url, res.status)
          const data = await res.json()
          // Accept a few key shapes
          let summary = data.news_summary || data.summary || data.NewsSummary || data['News Summary'] || ''
          if (!summary || !String(summary).trim()) {
            summary = 'No News Available for the selected period'
          }
          const sentiment = normalizeSentiment(data.sentiment || data.Sentiment || data['news_sentiment'])
          // Attach a current timestamp so existing date-based UI remains stable
          return { ticker: t, date: new Date().toISOString(), sentiment, summary }
        } catch (err) {
          console.error('[News API] FAIL', url, err)
          // On per-ticker failure, return a placeholder so the rest still render
          return { ticker: t, date: new Date().toISOString(), sentiment: 'Neutral', summary: 'Failed to fetch news summary.' }
        }
      }))
      setNewsSummaries(results)
    } catch (e) {
      setNewsError('Unable to retrieve news at this time.')
      setNewsSummaries([])
    } finally {
      setNewsLoading(false)
    }
  }

  const handleRefresh = async () => {
    // Clear all state when explicitly refreshing
    setTableHtml('')
    setHoldings([])
    setTickers([])
    setNewsSummaries([])
    
    // Clear persisted portfolio state
    if (setPortfolioLoaded && setPortfolioData) {
      setPortfolioLoaded(false)
      setPortfolioData(null)
    }
    
    // Then connect fresh
    await handleConnect()
  }

  const handleConnect = async () => {
    try {
      setLoading(true)
      
      // Step 1: ask backend for MCP login URL
      try {
        const loginRes = await fetch('/api/mcp/login')
        if (loginRes.ok) {
          const { login_url } = await loginRes.json()
          if (login_url) {
            // Open login URL in a new tab/window for the user to complete auth
            window.open(login_url, '_blank', 'noopener,noreferrer')
          }
        }
      } catch (_) {
        // If backend not reachable, continue to fallback after holdings poll
      }

      // Step 2: poll holdings until available (short, simple loop)
      let holdings = []
      let attempts = 0
      while (attempts < 5) {
        attempts += 1
        try {
          const hRes = await fetch('/api/mcp/holdings?refresh=true') // force fresh on explicit connect/refresh
          if (hRes.ok) {
            const data = await hRes.json()
            holdings = Array.isArray(data?.holdings) ? data.holdings : []
            if (holdings.length > 0) break
          }
        } catch {
          // ignore and retry
        }
        await new Promise(r => setTimeout(r, 1500 * attempts))
      }

      // Fallback to mock if no holdings
      if (!holdings || holdings.length === 0) {
        const html = parseMarkdownTableToHtml(mockMd)
        setTableHtml(html)
        setHoldings([])
        const lines = mockMd.trim().split(/\r?\n/).filter(Boolean)
        const headerLine = lines[0] || ''
        const rows = lines.slice(2)
        const headers = headerLine.split('|').map(s => s.trim()).filter(Boolean)
        let colIdx = headers.findIndex(h => /company/i.test(h))
        if (colIdx === -1) colIdx = headers.findIndex(h => /ticker/i.test(h))
        if (colIdx === -1) colIdx = 0
        const companies = rows
          .map(r => r.split('|').map(s => s.trim()).filter(Boolean)[colIdx] || '')
          .filter(Boolean)
        setTickers(companies)
        
        // Save portfolio state (if state management is available)
        if (setPortfolioLoaded && setPortfolioData) {
          setPortfolioLoaded(true)
          setPortfolioData({
            holdings: [],
            tickers: companies,
            tableHtml: html
          })
        }
        
        await fetchNews(newsFilter, companies)
        return
      }

      // Build table from real holdings
      const derivedHoldings = holdings.map(deriveRow)
      setHoldings(derivedHoldings)
      setTableHtml('')
      // Try to infer tickers/company codes from common fields
      const candidates = holdings.map(h => h?.symbol || h?.tradingsymbol || h?.ticker || h?.Company || h?.company).filter(Boolean)
      setTickers(candidates)
      
      // Save portfolio state (if state management is available) - Update cache after successful load
      if (setPortfolioLoaded && setPortfolioData) {
        setPortfolioLoaded(true)
        setPortfolioData({
          holdings: derivedHoldings,
          tickers: candidates,
          tableHtml: ''
        })
      }
      
      await fetchNews(newsFilter, candidates)
    } catch (e) {
      console.error('Error in handleConnect:', e)
      setTableHtml('<p style="color:#f99">Failed to load portfolio data.</p>')
      setHoldings([])
      setTickers([])
    } finally {
      setLoading(false)
    }
  }

  const changeFilter = async (days) => {
    setNewsFilter(days)
    // Fetch server-filtered results for selected timeframe
    await fetchNews(days)
  }

  // Not connected yet: show centered hero card with header, subtitle, and buttons stacked below
  if (!portfolioLoaded) {
    return (
      <div className="container analyse-center">
        <div className="analyse-hero-card">
          <h2 className="analyse-title">Analyse your portfolio</h2>
          <p className="muted analyse-subtitle">Connect your Zerodha portfolio to let InvestR analyse your holdings and provide insights.</p>
          <div className="analyse-actions analyse-actions-vertical">
            <button className="btn-primary" onClick={onBack}>Return to Home</button>
            <button className="btn-primary" onClick={handleConnect} disabled={loading}>
              {loading ? 'Loading…' : 'Connect your Zerodha Portfolio'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Connected: move header to top (below site header), hide subtitle, show table full-width
  return (
  <div className="container analyse-page">
      <div className="analyse-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 className="analyse-title" style={{ margin: 0 }}>Analyse your portfolio</h2>
          <span className="muted analyse-subtitle" style={{ fontSize: '1.1rem', marginTop: '2px' }}>NSE Code</span>
        </div>
        <div className="analyse-actions">
          <button className="btn-primary" onClick={handleRefresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh your Zerodha Portfolio'}
          </button>
          <button className="btn-primary" onClick={onBack}>Return to Home</button>          
        </div>
      </div>
  {holdings.length > 0 ? (
        isMobile ? (
          <div className="holdings-mobile-list">
            {holdings.map((r, idx) => {
              const pnlPos = Number(r.pnl) > 0
              const pnlNeg = Number(r.pnl) < 0
              const dcPos = Number(r.day_change) > 0
              const dcNeg = Number(r.day_change) < 0
              return (
                <button
                  key={idx}
                  className={`holding-card ${pnlPos ? 'pnl-pos' : ''} ${pnlNeg ? 'pnl-neg' : ''}`}
                  onClick={() => onCompanySelect && onCompanySelect(r.tradingsymbol)}
                  title={`View details for ${r.tradingsymbol}`}
                >
                  <div className="holding-card-row top">
                    <span className="symbol">{r.tradingsymbol}</span>
                    <span className={`pnl ${pnlPos ? 'positive' : ''} ${pnlNeg ? 'negative' : ''}`}>{fmtNum(r.pnl)}</span>
                  </div>
                  <div className="holding-card-row metrics">
                    <span><strong>{fmtNum(r.quantity,0)}</strong> QTY</span>
                    <span>@ {fmtNum(r.average_price)}</span>
                    <span>{fmtNum(r.price)}</span>
                  </div>
                  <div className="holding-card-row delta">
                    <span className={`delta-val ${dcPos ? 'positive' : ''} ${dcNeg ? 'negative' : ''}`}>{fmtNum(r.day_change)} ({fmtPct(r.day_change_percentage)})</span>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="portfolio-table-full portfolio-card">
            <table className="portfolio-table analyse-portfolio-table">
              <thead>
                <tr>
                  <th title="Trading symbol / Ticker">Symbol</th>
                  <th className="numeric" title="Last traded price">Price</th>
                  <th className="numeric" title="Total quantity held">Quantity</th>
                  <th className="numeric" title="T1 quantity (shares pending delivery)">T1 Qty</th>
                  <th className="numeric" title="Opening quantity for the day">Opening Qty</th>
                  <th className="numeric" title="Average buy price">Avg Price</th>
                  <th className="numeric" title="Previous close price">Prev Close</th>
                  <th className="numeric" title="Unrealized profit/loss">P&L</th>
                  <th className="numeric" title="Change since previous close">Day Change</th>
                  <th className="numeric" title="Percent change since previous close">Day Change %</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((r, idx) => {
                  const pnlPos = Number(r.pnl) > 0
                  const pnlNeg = Number(r.pnl) < 0
                  const dcPos = Number(r.day_change) > 0
                  const dcNeg = Number(r.day_change) < 0
                  return (
                    <tr
                      key={idx}
                      className="clickable-row"
                      onClick={() => onCompanySelect && onCompanySelect(r.tradingsymbol)}
                      style={{ cursor: 'pointer' }}
                      title={`Click to view details for ${r.tradingsymbol}`}
                    >
                      <td>{r.tradingsymbol}</td>
                      <td className="numeric">{fmtNum(r.price)}</td>
                      <td className="numeric">{fmtNum(r.quantity, 0)}</td>
                      <td className="numeric muted">{fmtNum(r.t1_quantity, 0)}</td>
                      <td className="numeric muted">{fmtNum(r.opening_quantity, 0)}</td>
                      <td className="numeric">{fmtNum(r.average_price)}</td>
                      <td className="numeric">{fmtNum(r.close_price)}</td>
                      <td className={`numeric pnl ${pnlPos ? 'positive' : ''} ${pnlNeg ? 'negative' : ''}`}>{fmtNum(r.pnl)}</td>
                      <td className={`numeric ${dcPos ? 'positive' : ''} ${dcNeg ? 'negative' : ''}`}>{fmtNum(r.day_change)}</td>
                      <td className={`numeric ${dcPos ? 'positive' : ''} ${dcNeg ? 'negative' : ''}`}>{fmtPct(r.day_change_percentage)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="portfolio-table-full portfolio-card" dangerouslySetInnerHTML={{ __html: tableHtml }} />
      )}

      <section className="news-summary">
        <h3 className="news-title">News Summary</h3>
        <div className="news-controls">
          <div className="news-filters">
            <button className={`filter-btn ${newsFilter === 1 ? 'active' : ''}`} onClick={() => changeFilter(1)} disabled={newsLoading}>Last 1 Day</button>
            <button className={`filter-btn ${newsFilter === 7 ? 'active' : ''}`} onClick={() => changeFilter(7)} disabled={newsLoading}>Last 7 Days</button>
            <button className={`filter-btn ${newsFilter === 30 ? 'active' : ''}`} onClick={() => changeFilter(30)} disabled={newsLoading}>Last 30 Days</button>
          </div>
        </div>
        <div className="news-list" style={{ position: 'relative' }}>
          {newsLoading && (
            <div className="news-loading-overlay">
              <div className="news-spinner" />
              <span className="news-loading-text">Fetching news summaries…</span>
            </div>
          )}
          {!newsLoading && newsError && <p className="muted" style={{ color: '#f66' }}>{newsError}</p>}
          {newsSummaries.filter(ns => {
            const diffMs = Date.now() - new Date(ns.date).getTime()
            const diffDays = diffMs / (24 * 60 * 60 * 1000)
            return diffDays <= newsFilter
          }).map(ns => (
            <div className="news-row" key={ns.ticker}>
              <div className="news-row-header">
                <span className={`sentiment-tag ${ns.sentiment.toLowerCase()}`}>{ns.sentiment}</span>
                <strong className="news-ticker">{ns.ticker}</strong>
                {/* <small className="news-date">{new Date(ns.date).toLocaleDateString()}</small> */}
              </div>
              <p className="news-paragraph" style={{ whiteSpace: 'pre-line' }}>
                {formatBulletPoints(ns.summary)}
              </p>
            </div>
          ))}
          {newsSummaries.filter(ns => {
            const diffMs = Date.now() - new Date(ns.date).getTime()
            const diffDays = diffMs / (24 * 60 * 60 * 1000)
            return diffDays <= newsFilter
          }).length === 0 && (
            <p className="muted">No news items match the selected timeframe.</p>
          )}
        </div>
      </section>
    </div>
  )
}
