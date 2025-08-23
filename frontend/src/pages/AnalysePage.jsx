import { useState } from 'react'
import mockMd from '../mock/portfolioTable.md?raw'

export default function AnalysePage({ onBack }) {
  const [tableHtml, setTableHtml] = useState('')
  const [loading, setLoading] = useState(false)

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
      const html = parseMarkdownTableToHtml(mockMd)
      setTableHtml(html)
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
    </div>
  )
}
