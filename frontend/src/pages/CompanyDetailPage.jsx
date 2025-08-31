import { useState, useEffect } from 'react'

export default function CompanyDetailPage({ symbol, onBack }) {
  const [companyData, setCompanyData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newsData, setNewsData] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsFilter, setNewsFilter] = useState(7) // days
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('daily') // daily, quarterly, yearly
  const [activeQuarter, setActiveQuarter] = useState('Q1-2024') // for quarterly tab

  const API_BASE = 'https://api-indian-financial-markets-485071544262.asia-south1.run.app'

  // Formatting helpers
  const fmtNum = (n, digits = 2) => {
    if (n === null || n === undefined || isNaN(n)) return '-'
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })
  }
  const fmtPct = (n) => (n === null || n === undefined || isNaN(n) ? '-' : `${fmtNum(n, 2)}%`)

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
    return text.replace(/^\s*([-*])\s*/gm, '\n$1 ')
  }

  // Fetch company details
  const fetchCompanyData = async () => {
    try {
      setLoading(true)
      // Try to get holdings data from the backend first
      const holdingsRes = await fetch('/api/mcp/holdings')
      if (holdingsRes.ok) {
        const holdingsData = await holdingsRes.json()
        const holdings = Array.isArray(holdingsData?.holdings) ? holdingsData.holdings : []
        const companyHolding = holdings.find(h => 
          (h?.symbol === symbol) || 
          (h?.tradingsymbol === symbol) || 
          (h?.ticker === symbol)
        )
        
        if (companyHolding) {
          // Derive company data from holdings
          const price = Number(companyHolding?.price ?? companyHolding?.last_price ?? companyHolding?.close_price ?? 0)
          const qty = Number(companyHolding?.quantity ?? 0)
          const avg = Number(companyHolding?.average_price ?? 0)
          const close = Number(companyHolding?.close_price ?? price)
          const dayChange = companyHolding?.day_change !== undefined ? Number(companyHolding.day_change) : (price - close)
          const dayChangePct = companyHolding?.day_change_percentage !== undefined
            ? Number(companyHolding.day_change_percentage)
            : (close ? ((dayChange / close) * 100) : 0)
          const pnl = companyHolding?.pnl !== undefined ? Number(companyHolding.pnl) : ((price - avg) * qty)
          
          setCompanyData({
            symbol: companyHolding?.tradingsymbol ?? companyHolding?.symbol ?? symbol,
            company_name: companyHolding?.company_name ?? companyHolding?.Company ?? symbol,
            price,
            quantity: qty,
            t1_quantity: Number(companyHolding?.t1_quantity ?? companyHolding?.t1Quantity ?? 0),
            opening_quantity: Number(companyHolding?.opening_quantity ?? companyHolding?.openingQuantity ?? 0),
            average_price: avg,
            close_price: close,
            pnl,
            day_change: dayChange,
            day_change_percentage: dayChangePct,
            market_value: price * qty,
            investment_value: avg * qty,
          })
        } else {
          // Fallback for symbol not found in holdings
          setCompanyData({
            symbol,
            company_name: symbol,
            error: 'Company not found in your holdings'
          })
        }
      } else {
        // Fallback when backend not available
        setCompanyData({
          symbol,
          company_name: symbol,
          error: 'Unable to fetch company data'
        })
      }
    } catch (err) {
      console.error('Error fetching company data:', err)
      setError('Failed to load company information')
      setCompanyData({
        symbol,
        company_name: symbol,
        error: 'Failed to load company information'
      })
    } finally {
      setLoading(false)
    }
  }

  // Fetch news for the company
  const fetchNews = async (days) => {
    setNewsLoading(true)
    try {
      const pathSeg = timeframePath(days)
      const url = `${API_BASE}/companies/${encodeURIComponent(symbol)}/news/${pathSeg}/`
      console.log('[Company News API] GET', url)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      
      const data = await res.json()
      let summary = data.news_summary || data.summary || data.NewsSummary || data['News Summary'] || ''
      if (!summary || !String(summary).trim()) {
        summary = 'No News Available for the selected period'
      }
      const sentiment = normalizeSentiment(data.sentiment || data.Sentiment || data['news_sentiment'])
      
      setNewsData([{
        ticker: symbol,
        date: new Date().toISOString(),
        sentiment,
        summary
      }])
    } catch (err) {
      console.error('[Company News API] FAIL', err)
      setNewsData([{
        ticker: symbol,
        date: new Date().toISOString(),
        sentiment: 'Neutral',
        summary: 'Failed to fetch news summary.'
      }])
    } finally {
      setNewsLoading(false)
    }
  }

  useEffect(() => {
    if (symbol) {
      fetchCompanyData()
      fetchNews(newsFilter)
    }
  }, [symbol])

  const changeNewsFilter = async (days) => {
    setNewsFilter(days)
    await fetchNews(days)
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading-container">
          <p>Loading company details...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="error-container">
          <h2>Error</h2>
          <p>{error}</p>
          <button className="btn-primary" onClick={onBack}>
            Return to Portfolio
          </button>
        </div>
      </div>
    )
  }

  const pnlPositive = companyData?.pnl && Number(companyData.pnl) > 0
  const pnlNegative = companyData?.pnl && Number(companyData.pnl) < 0
  const dayChangePositive = companyData?.day_change && Number(companyData.day_change) > 0
  const dayChangeNegative = companyData?.day_change && Number(companyData.day_change) < 0

  return (
    <div className="container company-detail-page">
      <div className="company-detail-header">
        <button className="btn-secondary back-btn" onClick={onBack}>
          ← Return to Portfolio
        </button>
        <h1 className="company-title">{companyData?.company_name || symbol}</h1>
        <span className="company-symbol">{symbol}</span>
      </div>

      {companyData?.error ? (
        <div className="error-message">
          <p>{companyData.error}</p>
        </div>
      ) : (
        <>
          {/* Price and Performance Section */}
          <div className="company-metrics-grid">
            <div className="metric-card">
              <h3>Current Investment</h3>
              <div className="metric-value">₹{fmtNum(companyData?.investment_value)}</div>
              <div className="metric-subtitle">
                {fmtNum(companyData?.quantity, 0)} shares @ ₹{fmtNum(companyData?.average_price)}
              </div>
            </div>

            <div className="metric-card">
              <h3>Market Value</h3>
              <div className="metric-value">
                ₹{fmtNum(companyData?.market_value && companyData.market_value > 0 
                  ? companyData.market_value 
                  : (companyData?.close_price || 0) * (companyData?.quantity || 0))}
              </div>
              <div className="metric-subtitle">
                {fmtNum(companyData?.quantity, 0)} shares @ ₹{fmtNum(
                  companyData?.market_value && companyData.market_value > 0 
                    ? companyData.price 
                    : companyData?.close_price
                )}
              </div>
            </div>

            <div className="metric-card">
              <h3>Day Change</h3>
              <div className={`metric-value ${dayChangePositive ? 'positive' : ''} ${dayChangeNegative ? 'negative' : ''}`}>
                ₹{fmtNum(companyData?.price)}
              </div>
              <div className={`metric-subtitle ${dayChangePositive ? 'positive' : ''} ${dayChangeNegative ? 'negative' : ''}`}>
                {dayChangePositive ? '+' : ''}₹{fmtNum(companyData?.day_change)} ({fmtPct(companyData?.day_change_percentage)})
              </div>
            </div>

            <div className="metric-card">
              <h3>Profit & Loss</h3>
              <div className={`metric-value ${pnlPositive ? 'positive' : ''} ${pnlNegative ? 'negative' : ''}`}>
                ₹{fmtNum(companyData?.pnl)}
              </div>
              <div className={`metric-subtitle ${pnlPositive ? 'positive' : ''} ${pnlNegative ? 'negative' : ''}`}>
                {companyData?.pnl && companyData?.investment_value ? 
                  `${fmtPct((companyData.pnl / companyData.investment_value) * 100)} return` : 
                  '-'
                }
              </div>
            </div>
          </div>

          {/* Holdings Details */}
          <div className="holdings-detail-card">
            <h3>Holdings Breakdown</h3>
            <div className="holdings-details-grid">
              <div className="detail-item">
                <span className="detail-label">Total Quantity:</span>
                <span className="detail-value">{fmtNum(companyData?.quantity, 0)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">T1 Quantity:</span>
                <span className="detail-value">{fmtNum(companyData?.t1_quantity, 0)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Average Price:</span>
                <span className="detail-value">{fmtNum(companyData?.average_price, 0)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Previous Close:</span>
                <span className="detail-value">₹{fmtNum(companyData?.close_price)}</span>
              </div>
            </div>
          </div>

          {/* Investment Recommendation Card */}
          <div className="recommendation-card">
            <h3>Investment Recommendation</h3>
            <div className="recommendation-content">
              <p className="recommendation-placeholder">
                Analysis coming soon... This section will provide AI-powered insights on whether to hold, buy more, or sell this stock based on comprehensive analysis.
              </p>
            </div>
          </div>

          {/* Tabbed Content Section */}
          <div className="company-tabs-container">
            <div className="tabs-header">
              <button 
                className={`tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
                onClick={() => setActiveTab('daily')}
              >
                Daily Updates
              </button>
              <button 
                className={`tab-btn ${activeTab === 'quarterly' ? 'active' : ''}`}
                onClick={() => setActiveTab('quarterly')}
              >
                Quarterly Updates
              </button>
              <button 
                className={`tab-btn ${activeTab === 'yearly' ? 'active' : ''}`}
                onClick={() => setActiveTab('yearly')}
              >
                Yearly Updates
              </button>
            </div>

            <div className="tab-content">
              {/* Daily Updates Tab */}
              {activeTab === 'daily' && (
                <div className="daily-tab-content">
                  <div className="daily-cards-grid">
                    {/* News Section */}
                    <section className="company-news-section">
                      <h3 className="news-title">News & Sentiment</h3>
                      <div className="news-controls">
                        <div className="news-filters">
                          <button 
                            className={`filter-btn ${newsFilter === 1 ? 'active' : ''}`} 
                            onClick={() => changeNewsFilter(1)} 
                            disabled={newsLoading}
                          >
                            Last 1 Day
                          </button>
                          <button 
                            className={`filter-btn ${newsFilter === 7 ? 'active' : ''}`} 
                            onClick={() => changeNewsFilter(7)} 
                            disabled={newsLoading}
                          >
                            Last 7 Days
                          </button>
                          <button 
                            className={`filter-btn ${newsFilter === 30 ? 'active' : ''}`} 
                            onClick={() => changeNewsFilter(30)} 
                            disabled={newsLoading}
                          >
                            Last 30 Days
                          </button>
                        </div>
                      </div>
                      
                      <div className="news-list" style={{ position: 'relative' }}>
                        {newsLoading && (
                          <div className="news-loading-overlay">
                            <div className="news-spinner" />
                            <span className="news-loading-text">Fetching news summary…</span>
                          </div>
                        )}
                        
                        {newsData.map(ns => (
                          <div className="news-row company-news-row" key={ns.ticker}>
                            <div className="news-row-header">
                              <span className={`sentiment-tag ${ns.sentiment.toLowerCase()}`}>{ns.sentiment}</span>
                            </div>
                            <p className="news-paragraph" style={{ whiteSpace: 'pre-line' }}>
                              {formatBulletPoints(ns.summary)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Corporate Events Card */}
                    <div className="corporate-events-card">
                      <h3>Corporate Events & Announcements</h3>
                      <div className="events-content">
                        <p className="events-placeholder">
                          Corporate events, earnings announcements, dividend declarations, and other important company updates will appear here.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quarterly Updates Tab */}
              {activeTab === 'quarterly' && (
                <div className="quarterly-tab-content">
                  <div className="quarterly-nav">
                    <div className="quarter-filters">
                      {['Q1-2024', 'Q2-2024', 'Q3-2024', 'Q4-2024', 'Q1-2025'].map(quarter => (
                        <button 
                          key={quarter}
                          className={`quarter-btn ${activeQuarter === quarter ? 'active' : ''}`}
                          onClick={() => setActiveQuarter(quarter)}
                        >
                          {quarter}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="quarterly-content">
                    <h4>Financial Quarter: {activeQuarter}</h4>
                    
                    <div className="quarterly-cards-grid">
                      <div className="quarterly-card">
                        <h5>Conference Call PDF</h5>
                        <p>Conference call transcript and presentation materials will be available here.</p>
                      </div>
                      
                      <div className="quarterly-card">
                        <h5>Quarterly Results</h5>
                        <p>Financial results, key metrics, and performance indicators for {activeQuarter}.</p>
                      </div>
                      
                      <div className="quarterly-card">
                        <h5>Call Summary & Sentiment</h5>
                        <p>AI-generated summary of the conference call with sentiment analysis and key highlights.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Yearly Updates Tab */}
              {activeTab === 'yearly' && (
                <div className="yearly-tab-content">
                  <div className="yearly-cards-grid">
                    <div className="yearly-card">
                      <h4>Annual Report Links</h4>
                      <p>Direct links to annual reports, regulatory filings, and comprehensive company documentation.</p>
                    </div>
                    
                    <div className="yearly-card">
                      <h4>Annual Report Summary</h4>
                      <p>AI-powered analysis and summary of the annual report highlighting key business developments, strategies, and outlook.</p>
                    </div>
                    
                    <div className="yearly-card">
                      <h4>Yearly Financials</h4>
                      <p>Comprehensive financial data, ratios, and year-over-year performance metrics.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
