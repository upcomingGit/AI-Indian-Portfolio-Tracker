import { useState, useEffect } from 'react'

export default function CompanyDetailPage({ symbol, onBack }) {
  const [companyData, setCompanyData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newsData, setNewsData] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsFilter, setNewsFilter] = useState(7) // days
  const [eventsFilter, setEventsFilter] = useState(30) // 30 days or 'all'
  const [eventsData, setEventsData] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsCurrentPage, setEventsCurrentPage] = useState(1)
  const [eventsPerPage] = useState(5) // Show 5 events per page
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('daily') // daily, quarterly, yearly
  const [activeQuarter, setActiveQuarter] = useState('Q1-2024') // for quarterly tab
  const [knowledgeBasePaneOpen, setKnowledgeBasePaneOpen] = useState(false)
  const [knowledgeBaseData, setKnowledgeBaseData] = useState('')
  const [knowledgeBaseLoading, setKnowledgeBaseLoading] = useState(false)

  const API_BASE = import.meta.env.VITE_API_BASE

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
      const holdingsRes = await fetch(`${import.meta.env.VITE_API_BASE}/api/mcp/holdings`)
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
      fetchCorporateEvents(eventsFilter)
    }
  }, [symbol])

  const changeNewsFilter = async (days) => {
    setNewsFilter(days)
    await fetchNews(days)
  }

  // Fetch corporate events data
  const fetchCorporateEvents = async (filter) => {
    try {
      setEventsLoading(true)
      
      // Call the backend API for corporate events
      const filterParam = filter === 'all' ? 'all' : String(filter)
      const url = `${import.meta.env.VITE_API_BASE}/api/corporate-events/${encodeURIComponent(symbol)}?filter_type=${filterParam}`
      console.log('[Corporate Events API] GET', url)
      
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[Corporate Events API] HTTP ${res.status}, falling back to placeholder`)
        throw new Error(`HTTP ${res.status}`)
      }
      
      const data = await res.json()
      const events = Array.isArray(data?.events) ? data.events : []
      
      console.log(`[Corporate Events API] Received ${events.length} events`)
      setEventsData(events)
      
    } catch (err) {
      console.error('Error fetching corporate events:', err)
      
      // Fallback to placeholder data on error
      const placeholderEvents = filter === 'all' ? [
        {
          id: 1,
          event_type: 'Dividend Declaration',
          description: 'Board declared interim dividend of ₹12 per share',
          event_date: '2024-12-15',
          record_date: '2024-12-20'
        },
        {
          id: 2,
          event_type: 'Earnings Announcement',
          description: 'Q3 FY2024 earnings results announced',
          event_date: '2024-11-10',
          eps: '₹45.20'
        },
        {
          id: 3,
          event_type: 'Stock Split',
          description: 'Board approved stock split in ratio 1:2',
          event_date: '2024-08-22',
          ex_date: '2024-09-01'
        }
      ] : [
        {
          id: 1,
          event_type: 'Dividend Declaration',
          description: 'Board declared interim dividend of ₹12 per share',
          event_date: '2024-12-15',
          record_date: '2024-12-20'
        }
      ]
      
      setEventsData(placeholderEvents)
    } finally {
      setEventsLoading(false)
    }
  }

  const changeEventsFilter = async (filter) => {
    setEventsFilter(filter)
    setEventsCurrentPage(1) // Reset to first page when filter changes
    await fetchCorporateEvents(filter)
  }

  // Fetch knowledge base data
  const fetchKnowledgeBase = async () => {
    setKnowledgeBaseLoading(true)
    try {
      // TODO: Replace with actual API call when backend is ready
      // const url = `${API_BASE}/companies/${encodeURIComponent(symbol)}/knowledge-base/`
      // const res = await fetch(url)
      // if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // const data = await res.json()
      
      // Placeholder data for now
      const placeholderData = `
📊 Analyst Knowledge Base for ${symbol}

🔍 Company Overview:
This section will contain comprehensive analyst research and insights about ${companyData?.company_name || symbol}.

📈 Key Financial Metrics:
• Revenue growth trends and projections
• Profitability analysis and margin expansion
• Cash flow generation and capital allocation
• Balance sheet strength and debt levels

🏭 Business Analysis:
• Competitive positioning in the industry
• Market share dynamics and growth opportunities
• Operational efficiency and cost management
• Strategic initiatives and expansion plans

🌍 Market Environment:
• Industry outlook and regulatory changes
• Economic factors affecting the business
• Peer comparison and valuation metrics
• Risk factors and mitigation strategies

📊 Analyst Recommendations:
• Consensus price targets and ratings
• Recent research report highlights
• Earnings estimate revisions
• Long-term investment thesis

🔮 Future Outlook:
• Growth catalysts and investment drivers
• Potential headwinds and challenges
• Strategic roadmap and management guidance
• ESG considerations and sustainability initiatives

Note: This is placeholder content. The actual knowledge base will be populated with real analyst research, reports, and insights from our database when the API is implemented.
      `
      
      setKnowledgeBaseData(placeholderData)
    } catch (err) {
      console.error('Error fetching knowledge base:', err)
      setKnowledgeBaseData('Failed to load analyst knowledge base. Please try again later.')
    } finally {
      setKnowledgeBaseLoading(false)
    }
  }

  const toggleKnowledgeBasePane = () => {
    if (!knowledgeBasePaneOpen && !knowledgeBaseData) {
      fetchKnowledgeBase()
    }
    setKnowledgeBasePaneOpen(!knowledgeBasePaneOpen)
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
        <div className="company-title-section">
          <div>
            <h1 className="company-title">{companyData?.company_name || symbol}</h1>
            <span className="company-symbol">{symbol}</span>
          </div>
          <button 
            className="btn-primary knowledge-base-btn" 
            onClick={toggleKnowledgeBasePane}
          >
            📊 View Analyst Knowledge Base
          </button>
        </div>
      </div>

      {/* Knowledge Base Side Pane */}
      {knowledgeBasePaneOpen && (
        <div className="knowledge-base-overlay" onClick={() => setKnowledgeBasePaneOpen(false)}>
          <div className="knowledge-base-pane" onClick={(e) => e.stopPropagation()}>
            <div className="knowledge-base-header">
              <h3>Analyst Knowledge Base</h3>
              <button 
                className="close-pane-btn" 
                onClick={() => setKnowledgeBasePaneOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="knowledge-base-content">
              {knowledgeBaseLoading ? (
                <div className="knowledge-base-loading">
                  <div className="spinner"></div>
                  <p>Loading analyst insights...</p>
                </div>
              ) : (
                <div className="knowledge-base-text">
                  <pre>{knowledgeBaseData}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                ₹{fmtNum(companyData?.price && companyData.price > 0 ? companyData.price : companyData?.close_price)}
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
                      <div className="events-controls">
                        <div className="events-filters">
                          <button 
                            className={`filter-btn ${eventsFilter === 30 ? 'active' : ''}`} 
                            onClick={() => changeEventsFilter(30)} 
                            disabled={eventsLoading}
                          >
                            Last 30 Days
                          </button>
                          <button 
                            className={`filter-btn ${eventsFilter === 'all' ? 'active' : ''}`} 
                            onClick={() => changeEventsFilter('all')} 
                            disabled={eventsLoading}
                          >
                            All
                          </button>
                        </div>
                      </div>
                      <div className="events-content">
                        {eventsLoading ? (
                          <div className="events-loading">
                            <p>Loading corporate events...</p>
                          </div>
                        ) : eventsData.length > 0 ? (
                          <>
                            <div className="events-list">
                              {(() => {
                                // Calculate pagination
                                const totalEvents = eventsData.length
                                const totalPages = Math.ceil(totalEvents / eventsPerPage)
                                const startIndex = (eventsCurrentPage - 1) * eventsPerPage
                                const endIndex = startIndex + eventsPerPage
                                const currentEvents = eventsData.slice(startIndex, endIndex)
                                
                                return currentEvents.map((event, index) => (
                                  <div key={event.id} className="news-row company-events-row" style={{ marginBottom: index < currentEvents.length - 1 ? '16px' : '0' }}>
                                    <div className="event-header">
                                      <div className="event-header-left">
                                        <span className="event-type-tag">{event.event_type}</span>
                                        <h4 className="event-title-inline">{event.description}</h4>
                                      </div>
                                      <span className="event-date">{new Date(event.event_date).toLocaleDateString()}</span>
                                    </div>
                                    
                                    <div className="event-links">
                                      {event.url && (
                                        <a 
                                          href={event.url} 
                                          target="_blank" 
                                          rel="noopener noreferrer" 
                                          className="event-link primary-link"
                                        >
                                          📊 View on BSE
                                        </a>
                                      )}
                                      
                                      {event.attachment_url && (
                                        <a 
                                          href={`https://www.bseindia.com/xml-data/corpfiling/AttachLive/${event.attachment_url}`} 
                                          target="_blank" 
                                          rel="noopener noreferrer" 
                                          className="event-link attachment-link"
                                        >
                                          📄 Download PDF
                                        </a>
                                      )}
                                    </div>
                                    
                                    {/* Fallback for older event format compatibility */}
                                    {event.record_date && (
                                      <p className="event-detail">Record Date: {new Date(event.record_date).toLocaleDateString()}</p>
                                    )}
                                    {event.ex_date && (
                                      <p className="event-detail">Ex-Date: {new Date(event.ex_date).toLocaleDateString()}</p>
                                    )}
                                    {event.eps && (
                                      <p className="event-detail">EPS: {event.eps}</p>
                                    )}
                                  </div>
                                ))
                              })()}
                            </div>
                            
                            {/* Pagination Controls */}
                            {eventsData.length > eventsPerPage && (
                              <div className="events-pagination">
                                <div className="pagination-info">
                                  Showing {Math.min((eventsCurrentPage - 1) * eventsPerPage + 1, eventsData.length)} - {Math.min(eventsCurrentPage * eventsPerPage, eventsData.length)} of {eventsData.length} events
                                </div>
                                <div className="pagination-controls">
                                  <button
                                    className="pagination-btn"
                                    onClick={() => setEventsCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={eventsCurrentPage === 1}
                                  >
                                    ← Previous
                                  </button>
                                  
                                  <span className="pagination-pages">
                                    Page {eventsCurrentPage} of {Math.ceil(eventsData.length / eventsPerPage)}
                                  </span>
                                  
                                  <button
                                    className="pagination-btn"
                                    onClick={() => setEventsCurrentPage(prev => Math.min(prev + 1, Math.ceil(eventsData.length / eventsPerPage)))}
                                    disabled={eventsCurrentPage === Math.ceil(eventsData.length / eventsPerPage)}
                                  >
                                    Next →
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="events-placeholder">
                            No corporate events found for the selected timeframe.
                          </p>
                        )}
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
