import { useState } from 'react'
// MOCK DATA IMPORT: replace `mockMd` with a real API response or prop when integrating.
// Example: import tableMarkdown from '../api/portfolioResponse'
import mockMd from '../mock/portfolioTable.md?raw'

export default function AnalysePage({ onBack }) {
  const [tableHtml, setTableHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [newsSummaries, setNewsSummaries] = useState([])
  const [newsFilter, setNewsFilter] = useState(7) // days
  const [tickers, setTickers] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsError, setNewsError] = useState('')

  // API base for news + sentiment
  const API_BASE = 'https://api-indian-financial-markets-485071544262.asia-south1.run.app'

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

  const handleConnect = async () => {
    try {
      setLoading(true)
      // ------------------ MOCK: table HTML generation ------------------
      // This line uses the local `mockMd` markdown to build the table HTML. Replace
      // `mockMd` with your fetched markdown or HTML payload when integrating.
      const html = parseMarkdownTableToHtml(mockMd)
      setTableHtml(html)
      // ------------------ END MOCK: table HTML generation ------------------
      // Derive company identifiers from the markdown table
      // Prefer a column named "Company"; fallback to "Ticker"; else use first column
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
      // Initial fetch for default timeframe
      await fetchNews(newsFilter, companies)
    } catch (e) {
      setTableHtml('<p style=\"color:#f99\">Failed to load mock data.</p>')
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
  if (!tableHtml) {
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
        <h2 className="analyse-title">Analyse your portfolio</h2>
        <div className="analyse-actions">
          <button className="btn-primary" onClick={handleConnect} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh your Zerodha Portfolio'}
          </button>
          <button className="btn-primary" onClick={onBack}>Return to Home</button>          
        </div>
      </div>
      <div className="portfolio-table-full portfolio-card" dangerouslySetInnerHTML={{ __html: tableHtml }} />

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
