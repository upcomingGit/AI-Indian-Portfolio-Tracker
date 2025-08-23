import { useState } from 'react'
// MOCK DATA IMPORT: replace `mockMd` with a real API response or prop when integrating.
// Example: import tableMarkdown from '../api/portfolioResponse'
import mockMd from '../mock/portfolioTable.md?raw'

export default function AnalysePage({ onBack }) {
  const [tableHtml, setTableHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [newsSummaries, setNewsSummaries] = useState([])
  const [newsFilter, setNewsFilter] = useState(7) // days

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

  const handleConnect = async () => {
    try {
      setLoading(true)
      // ------------------ MOCK: table HTML generation ------------------
      // This line uses the local `mockMd` markdown to build the table HTML. Replace
      // `mockMd` with your fetched markdown or HTML payload when integrating.
      const html = parseMarkdownTableToHtml(mockMd)
      setTableHtml(html)
      // ------------------ END MOCK: table HTML generation ------------------

      // ------------------ MOCK: derive tickers and create news summaries ------------------
      // The block below creates deterministic mock summaries and dates from the
      // local markdown. Replace this with a real news-fetch + summarization
      // pipeline and call `setNewsSummaries` with the server results.
      const lines = mockMd.trim().split(/\r?\n/).filter(Boolean)
      const rows = lines.slice(2) // skip header + separator
      const tickers = rows.map(r => r.split('|').map(s => s.trim()).filter(Boolean)[0])
      const now = Date.now()
      const summaries = tickers.map((t, i) => {
        // create deterministic mock dates within last 0-29 days
        const offsetDays = (i * 7 + 2) % 30
        const date = new Date(now - offsetDays * 24 * 60 * 60 * 1000).toISOString()
        // MOCK SENTIMENT: deterministic placeholder (replace with real sentiment result)
        // 0 => positive, 1 => neutral, 2 => negative
        const sentimentIndex = offsetDays % 3
        const sentiment = sentimentIndex === 0 ? 'Positive' : sentimentIndex === 1 ? 'Neutral' : 'Negative'
        return {
          ticker: t,
          date,
          sentiment,
          // placeholder summary — replace with real data later
          summary: `Over the last ${Math.max(1, offsetDays)} days, ${t} saw mixed news including earnings chatter, sector movement and analyst notes. Key points: check recent announcements and price action.`
        }
      })
      setNewsSummaries(summaries)
      // ------------------ END MOCK: news summary generation ------------------
    } catch (e) {
      setTableHtml('<p style=\"color:#f99\">Failed to load mock data.</p>')
    } finally {
      setLoading(false)
    }
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
            <button className={`filter-btn ${newsFilter === 1 ? 'active' : ''}`} onClick={() => setNewsFilter(1)}>Last 1 Day</button>
            <button className={`filter-btn ${newsFilter === 7 ? 'active' : ''}`} onClick={() => setNewsFilter(7)}>Last 7 Days</button>
            <button className={`filter-btn ${newsFilter === 30 ? 'active' : ''}`} onClick={() => setNewsFilter(30)}>Last 30 Days</button>
          </div>
        </div>
        <div className="news-list">
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
              <p className="news-paragraph">{ns.summary}</p>
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
