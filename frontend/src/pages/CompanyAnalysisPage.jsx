import { useState, useEffect, useMemo, memo, useCallback, startTransition } from 'react'
import './CompanyAnalysisPage.css'
import { useCompanyAnalysis } from '../hooks/useCompanyAnalysis'
import { useCompanySignals } from '../hooks/useCompanySignals'

// Very small inline markdown (bold **text**) renderer for limited strings
const renderInlineMarkdown = (text) => {
  if (!text) return ''
  // Basic escape to prevent HTML injection, then bold swap
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

const escapeHtml = (value = '') => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const applyInlineFormatting = (text = '') => {
  if (!text) return ''
  let formatted = text
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  formatted = formatted.replace(/\*(?!\s)([^*]+?)\*/g, '<em>$1</em>')
  formatted = formatted.replace(/`([^`]+?)`/g, '<code>$1</code>')
  return formatted
}

const renderConferenceMarkdown = (markdown = '') => {
  if (!markdown) return ''

  const escaped = escapeHtml(markdown)
  const lines = escaped.split(/\r?\n/)
  const html = []
  let listMode = null

  const closeList = () => {
    if (!listMode) return
    html.push(listMode === 'ol' ? '</ol>' : '</ul>')
    listMode = null
  }

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      closeList()
      return
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      closeList()
      html.push('<hr class="conference-divider" />')
      return
    }

    const headingMatch = trimmed.match(/^(#{2,4})\s+(.*)$/)
    if (headingMatch) {
      closeList()
      const level = headingMatch[1].length
      const content = applyInlineFormatting(headingMatch[2].trim())
      const tag = level === 2 ? 'h3' : level === 3 ? 'h4' : 'h5'
      html.push(`<${tag} class="conference-heading level-${level}">${content}</${tag}>`)
      return
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/)
    if (unorderedMatch) {
      if (listMode !== 'ul') {
        closeList()
        html.push('<ul class="conference-list">')
        listMode = 'ul'
      }
      html.push(`<li>${applyInlineFormatting(unorderedMatch[1].trim())}</li>`)
      return
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/)
    if (orderedMatch) {
      if (listMode !== 'ol') {
        closeList()
        html.push('<ol class="conference-list ordered">')
        listMode = 'ol'
      }
      html.push(`<li>${applyInlineFormatting(orderedMatch[1].trim())}</li>`)
      return
    }

    closeList()
    html.push(`<p>${applyInlineFormatting(trimmed)}</p>`)
  })

  closeList()
  return html.join('')
}

const prepareConferenceSummary = (markdown = '') => {
  if (!markdown) {
    return {
      title: '',
      html: ''
    }
  }

  let cleaned = markdown.trim()
  cleaned = cleaned.replace(/^---\s*\n?/, '').replace(/\n?---\s*$/, '')

  let title = ''
  let firstHeadingCaptured = false
  cleaned = cleaned.replace(/^##\s+(.+)$/m, (match, heading) => {
    if (!firstHeadingCaptured) {
      firstHeadingCaptured = true
      title = heading.trim()
      return ''
    }
    return match
  })

  const html = renderConferenceMarkdown(cleaned.trim())

  return {
    title,
    html
  }
}

const createHeroExcerpt = (markdown = '') => {
  if (!markdown) return ''
  const withoutCodeBlocks = markdown.replace(/```[\s\S]*?```/g, '')
  const strippedLinks = withoutCodeBlocks.replace(/\[(.+?)\]\((.*?)\)/g, '$1')
  const cleaned = strippedLinks
    .replace(/[#*_`>\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned.length > 240 ? `${cleaned.slice(0, 240).trim()}…` : cleaned
}

// Simplified metric item component
const MetricItem = memo(({ metricName, score, justification }) => (
  <div className="metric-item">
    <div className="metric-header">
      <span className="metric-name">{metricName}</span>
      <span className={`metric-score ${score?.toLowerCase()}`}>
        {score === 'High' && '🟢'}
        {score === 'Medium' && '🟡'}
        {score === 'Low' && '🔴'}
        {score}
      </span>
    </div>
    <div className="metric-justification" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(justification) }} />
  </div>
))

// Simplified decision matrix item
const DecisionItem = memo(({ category, score, justification }) => (
  <div className="decision-item">
    <div className="decision-header">
      <span className="decision-category">{category}</span>
      <span className={`decision-score ${score?.toLowerCase()}`}>
        {score === 'High' && '🟢'}
        {score === 'Medium' && '🟡'}
        {score === 'Low' && '🔴'}
        {score}
      </span>
    </div>
    <div className="decision-justification">{justification}</div>
  </div>
))

const CATEGORY_LABELS = {
  // Handle backend parser output format (with emojis and spaces)
  '📊 Financial Metrics': 'Financial Metrics',
  'Financial Metrics': 'Financial Metrics',
  'financialMetrics': 'Financial Metrics',
  '🧾 Scutlebutt Metrics': 'Scutlebutt Metrics', 
  'Scutlebutt Metrics': 'Scutlebutt Metrics',
  'generalMetrics': 'Scutlebutt Metrics',
  '🏭 Industry Metrics': 'Industry Metrics',
  'Industry Metrics': 'Industry Metrics', 
  'industryMetrics': 'Industry Metrics',
  '👥 Management & Strategy Metrics': 'Management & Strategy Metrics',
  'Management & Strategy Metrics': 'Management & Strategy Metrics',
  'managementStrategyMetrics': 'Management & Strategy Metrics'
}

const THEME_OPTIONS = [
  {
    key: 'investment',
    label: 'Investment Memo',
    icon: '🧠',
    caption: 'AI-generated thesis and scoring'
  },
  {
    key: 'news',
    label: 'News & Corporate Updates',
    icon: '🗞️',
    caption: 'Curated headlines and regulatory filings'
  },
  {
    key: 'quarterly',
    label: 'Quarterly Performance & Strategy',
    icon: '📅',
    caption: 'Earnings pulse and management priorities'
  }
]

const CompanyAnalysisPage = memo(({ symbol, onBack }) => {
  const { data: analysisData, loading, error } = useCompanyAnalysis(symbol)
  const [currentPage, setCurrentPage] = useState(0)
  const [activeTheme, setActiveTheme] = useState('investment')
  const [extrasRequested, setExtrasRequested] = useState(false)

  useEffect(() => {
    if (activeTheme !== 'investment') {
      setExtrasRequested(true)
    }
  }, [activeTheme])

  useEffect(() => {
    setCurrentPage(0)
    setActiveTheme('investment')
    setExtrasRequested(false)
  }, [symbol])

  const { newsSummaries, events: corporateEvents, conferenceCalls, loading: updatesLoading, error: updatesError } = useCompanySignals(symbol, extrasRequested)

  const formattedConferenceCalls = useMemo(() => {
    if (!conferenceCalls || conferenceCalls.length === 0) {
      return []
    }

    const sorted = [...conferenceCalls].sort((a, b) => {
      if (a.fiscal_year === b.fiscal_year) {
        return b.fiscal_quarter - a.fiscal_quarter
      }
      return b.fiscal_year - a.fiscal_year
    })

    return sorted.map((call, index) => {
      const summaryText = call.summary || ''
      const { title, html } = prepareConferenceSummary(summaryText)
      const trimmedTitle = title ? title.replace(/^[-–—\s]+/, '').trim() : ''
      const fallbackHtml = html || `<p>${applyInlineFormatting(escapeHtml(summaryText || 'Summary not available.'))}</p>`
      const displayTitle = trimmedTitle || `Q${call.fiscal_quarter} FY${call.fiscal_year} Conference Call`
      const heroExcerpt = createHeroExcerpt(summaryText)

      return {
        ...call,
        summaryHtml: fallbackHtml,
        displayTitle,
        heroExcerpt,
        isFeatured: index === 0
      }
    })
  }, [conferenceCalls])

  // Memoize processed data to avoid recomputing on every render
  const processedData = useMemo(() => {
    if (!analysisData?.thesis) return null

    const thesis = analysisData.thesis

    // Build category grouped metrics preserving insertion order
    const categoryMetrics = []
    Object.entries(thesis.metrics || {}).forEach(([categoryKey, metrics]) => {
      const metricsArray = Object.entries(metrics).map(([metricName, metricData]) => ({
        id: `${categoryKey}-${metricName}`,
        category: categoryKey,
        metricName,
        ...metricData
      }))
      
      // Normalize category key for label lookup
      const normalizedKey = categoryKey
        .replace(/[📊🧾🏭👥]/g, '') // Remove emoji prefixes
        .trim()
        
      categoryMetrics.push({
        key: categoryKey,
        label: CATEGORY_LABELS[categoryKey] || CATEGORY_LABELS[normalizedKey] || normalizedKey,
        metrics: metricsArray
      })
    })

    // Flatten decision matrix
    const decisionItems = Object.entries(thesis.decisionMatrix || {}).map(([category, data]) => ({
      id: category,
      category,
      ...data
    }))

    return {
      executiveSummary: thesis.executiveSummary,
      recommendation: thesis.recommendation,
      recommendationSummary: thesis.recommendationSummary,
      caveats: thesis.caveats || [],
      generatedAt: thesis.generatedAt,
      categoryMetrics,
      decisionItems
    }
  }, [analysisData])

  const formatDate = useCallback((value) => {
    if (!value) return 'Date pending'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }, [])

  const sentimentToClass = useCallback((sentiment) => {
    if (!sentiment) return 'neutral'
    const normalised = sentiment.toLowerCase()
    if (normalised.includes('positive')) return 'positive'
    if (normalised.includes('negative')) return 'negative'
    if (normalised.includes('mixed')) return 'mixed'
    if (normalised.includes('bull')) return 'positive'
    if (normalised.includes('bear')) return 'negative'
    return 'neutral'
  }, [])

  const sortedCorporateEvents = useMemo(() => {
    if (!corporateEvents) return []
    return [...corporateEvents].sort((a, b) => {
      const aDate = new Date(a?.event_date || a?.date || 0)
      const bDate = new Date(b?.event_date || b?.date || 0)
      return bDate - aDate
    })
  }, [corporateEvents])

  const latestCorporateEvents = useMemo(() => sortedCorporateEvents.slice(0, 8), [sortedCorporateEvents])

  const strategyCategory = useMemo(() => processedData?.categoryMetrics?.find(cat => cat.label === 'Management & Strategy Metrics'), [processedData])

  const strategyMetrics = useMemo(() => strategyCategory?.metrics?.slice(0, 4) || [], [strategyCategory])

  const decisionHighlights = useMemo(() => processedData?.decisionItems?.slice(0, 3) || [], [processedData])

  const latestCall = formattedConferenceCalls[0] || null
  const totalConferenceCalls = formattedConferenceCalls.length

  // Category-based pagination (each page is a category)
  const currentCategory = processedData?.categoryMetrics?.[currentPage]
  const paginatedMetrics = currentCategory?.metrics || []
  const totalPages = processedData?.categoryMetrics?.length || 0

  // Preload next page data when user is on last page
  useEffect(() => {
    if (currentPage === totalPages - 1 && totalPages > 1) {
      // Could preload next company data here if available
    }
  }, [currentPage, totalPages])

  // Optimize scroll performance
  const scrollToMetrics = useCallback(() => {
    const element = document.querySelector('.metrics-section')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handlePageChangeOptimized = useCallback((page) => {
    startTransition(() => {
      setCurrentPage(page)
    })
    // Use requestAnimationFrame for smoother scrolling
    requestAnimationFrame(() => {
      scrollToMetrics()
    })
  }, [scrollToMetrics])

  if (loading) {
    return (
      <div className="analysis-container">
        <div className="analysis-header">
          <div className="company-header">
            <h1 className="company-title">Loading Analysis...</h1>
            <div className="company-symbol">{symbol}</div>
          </div>
        </div>
        <div className="analysis-content">
          <div className="loading-skeleton">
            <div className="skeleton-section"></div>
            <div className="skeleton-section"></div>
            <div className="skeleton-section"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !analysisData || !processedData) {
    return (
      <div className="analysis-container">
        <div className="error-state">
          <h2>Analysis Unavailable</h2>
          <p>Sorry, we couldn't load the investment analysis for this company.</p>
          {/* If symbol is missing (page refresh or navigation), show a helpful hint */}
          {!symbol ? (
            <>
              <p className="muted">It looks like the page was refreshed — please reopen the company from Research to view its analysis.</p>
              <button className="btn-secondary" onClick={onBack}>← Back to Research</button>
            </>
          ) : (
            <button className="btn-secondary" onClick={onBack}>← Back to Research</button>
          )}
        </div>
      </div>
    )
  }

  const { companyName, thesis } = analysisData || {}

  if (!thesis) {
    return (
      <div className="analysis-container">
        <div className="error-state">
          <h2>Analysis Unavailable</h2>
          <p>Sorry, we couldn't load the investment analysis for this company.</p>
          <button className="btn-secondary" onClick={onBack}>
            ← Back to Research
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="analysis-container">
      <div className="analysis-header">
        <button className="btn-back" onClick={onBack}>
          ← Back to Research
        </button>
        <div className="company-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', width: '100%', textAlign: 'center' }}>
          <h1 className="company-title" style={{ margin: 0 }}>{analysisData.companyName}</h1>
          <div className="company-symbol" style={{ fontSize: '1.2rem', marginTop: '2px' }}>{symbol}</div>
        </div>
      </div>

      <div className="theme-switcher" role="tablist" aria-label="Analysis views">
        {THEME_OPTIONS.map((option) => {
          const isActive = activeTheme === option.key
          return (
            <button
              key={option.key}
              type="button"
              className={`theme-chip ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTheme(option.key)}
              aria-pressed={isActive}
              role="tab"
            >
              <span className="theme-icon" aria-hidden="true">{option.icon}</span>
              <span className="theme-text">
                <span className="theme-label">{option.label}</span>
                <span className="theme-caption">{option.caption}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="theme-panels">
        {activeTheme === 'investment' && (
          <div className="theme-panel investment-panel" role="tabpanel">
            <div className="quick-summary">
              <div className="summary-card">
                <h3>Executive Summary</h3>
                <p dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(processedData.executiveSummary) }} />
              </div>
              <div className="recommendation-card">
                <div className={`recommendation-badge ${processedData.recommendation === 'Conditional Invest' ? 'conditional' : processedData.recommendation?.toLowerCase()}`}>
                  {processedData.recommendation === 'Invest' && '✅'}
                  {processedData.recommendation === 'Hold' && '⏸️'}
                  {processedData.recommendation === 'Avoid' && '❌'}
                  {processedData.recommendation === 'Conditional Invest' && '⚠️'}
                  {processedData.recommendation}
                </div>
                <p>{processedData.recommendationSummary}</p>
              </div>
            </div>

            {processedData.caveats.length > 0 && (
              <div className="caveats-section">
                <h2 className="section-title">Key Risks & Considerations</h2>
                <div className="caveats-list">
                  {processedData.caveats.map((caveat, index) => (
                    <div key={index} className="caveat-item" dangerouslySetInnerHTML={{ __html: '⚠️ ' + renderInlineMarkdown(caveat) }} />
                  ))}
                </div>
              </div>
            )}

            <div className="decision-section">
              <h2 className="section-title">Decision Matrix</h2>
              <div className="decision-list">
                {processedData.decisionItems.map((item) => (
                  <DecisionItem
                    key={item.id}
                    category={item.category}
                    score={item.score}
                    justification={item.justification}
                  />
                ))}
              </div>
            </div>

            <div className="metrics-section">
              <h2 className="section-title">Key Metrics</h2>
              {currentCategory && (
                <h3 className="section-title" style={{ fontSize: '1.05rem', border: 'none', marginTop: '-0.4rem', marginBottom: '1rem' }}>
                  {currentCategory.label}
                </h3>
              )}
              <div className="metrics-list">
                {paginatedMetrics.map((metric) => (
                  <MetricItem
                    key={metric.id}
                    metricName={metric.metricName}
                    score={metric.score}
                    justification={metric.justification}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="page-btn"
                    onClick={() => handlePageChangeOptimized(currentPage - 1)}
                    disabled={currentPage === 0}
                  >
                    ← Previous
                  </button>
                  <span className="page-info">
                    Category {currentPage + 1} of {totalPages}
                  </span>
                  <button
                    className="page-btn"
                    onClick={() => handlePageChangeOptimized(currentPage + 1)}
                    disabled={currentPage === totalPages - 1}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>

            {processedData.generatedAt && (
              <div className="analysis-metadata">
                <small>Analysis generated on {new Date(processedData.generatedAt).toLocaleDateString()}</small>
              </div>
            )}
          </div>
        )}

        {activeTheme === 'news' && (
          <div className="theme-panel news-panel" role="tabpanel">
            <div className="panel-header">
              <h2 className="panel-title">News & Corporate Updates</h2>
              <p className="panel-description">Stay on top of catalysts with AI summaries and verified exchange filings.</p>
            </div>
            {updatesLoading ? (
              <div className="panel-loading">
                <div className="loading-bar" />
                <div className="loading-bar" />
                <div className="loading-bar" />
              </div>
            ) : (
              <>
                {updatesError && <div className="panel-alert">{updatesError}</div>}
                <div className="news-grid">
                  <section className="news-column summaries-column">
                    <h3 className="panel-subtitle">News sentiment pulse</h3>
                    <div className="news-card-grid">
                      {newsSummaries?.length ? (
                        newsSummaries.map((summary) => (
                          <article key={summary.key} className={`news-card accent-${summary.accent || summary.key}`}>
                            <div className="news-card-header">
                              <span className="news-card-icon" aria-hidden="true">
                                {summary.key === '1d' ? '⚡' : summary.key === '7d' ? '🗓️' : '🕰️'}
                              </span>
                              <div className="news-card-meta">
                                <h4 className="news-card-title">{summary.label}</h4>
                                <span className={`sentiment-badge ${sentimentToClass(summary.sentiment)}`}>
                                  {summary.sentiment || 'Neutral'}
                                </span>
                              </div>
                            </div>
                            <p className="news-card-body" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(summary.summary) }} />
                          </article>
                        ))
                      ) : (
                        <div className="panel-empty">No recent news summaries available yet.</div>
                      )}
                    </div>
                  </section>
                  <section className="news-column updates-column">
                    <h3 className="panel-subtitle">Corporate timeline</h3>
                    <div className="events-timeline">
                      {latestCorporateEvents.length ? (
                        latestCorporateEvents.map((event, index) => (
                          <article key={event.id || `${event.event_type}-${event.event_date}-${index}`} className="event-card">
                            <div className="event-meta">
                              <span className="event-tag">{event.event_type || 'Announcement'}</span>
                              <span className="event-date">{formatDate(event.event_date || event.date)}</span>
                            </div>
                            <p className="event-description">{event.description || 'Details will be available soon.'}</p>
                            {event.source && <span className="event-source">Source: {event.source}</span>}
                          </article>
                        ))
                      ) : (
                        <div className="panel-empty">No corporate announcements captured in this window.</div>
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        )}

        {activeTheme === 'quarterly' && (
          <div className="theme-panel quarterly-panel" role="tabpanel">
            <div className="panel-header">
              <h2 className="panel-title">Quarterly Performance & Strategy</h2>
              <p className="panel-description">Conference call summaries and quarterly earnings insights.</p>
            </div>
            {updatesLoading ? (
              <div className="panel-loading">
                <div className="loading-bar" />
                <div className="loading-bar" />
                <div className="loading-bar" />
              </div>
            ) : (
              <>
                {updatesError && <div className="panel-alert">{updatesError}</div>}
                {formattedConferenceCalls.length > 0 ? (
                  <section className="conference-stack">
                    {latestCall && (
                      <div className="conference-hero">
                        <div className="conference-hero-content">
                          <span className="conference-hero-label">Latest Conference Call</span>
                          <h3 className="conference-hero-title">{latestCall.displayTitle}</h3>
                          <div className="conference-hero-meta">
                            <span className="conference-meta-chip">Q{latestCall.fiscal_quarter} FY{latestCall.fiscal_year}</span>
                            <span className="conference-meta-chip accent">AI research capsule</span>
                            <span className="conference-meta-chip subtle">{totalConferenceCalls} curated call{totalConferenceCalls > 1 ? 's' : ''}</span>
                          </div>
                          {latestCall.heroExcerpt && (
                            <p className="conference-hero-excerpt">{latestCall.heroExcerpt}</p>
                          )}
                        </div>
                        <div className="conference-hero-visual" aria-hidden="true">
                          <div className="conference-hero-glow" />
                          <div className="conference-hero-orb" />
                        </div>
                      </div>
                    )}
                    <div className="conference-cards-grid">
                      {formattedConferenceCalls.map((call, index) => (
                        <article
                          key={`${call.fiscal_year}-${call.fiscal_quarter}-${index}`}
                          className={`conference-summary-card${call.isFeatured ? ' featured' : ''}`}
                        >
                          <div className="conference-card-header">
                            <span className="conference-chip">Q{call.fiscal_quarter} FY{call.fiscal_year}</span>
                            <div className="conference-title-wrap">
                              <span className="conference-eyebrow" aria-label="Conference call context">
                                Conference Call
                              </span>
                              <h4 className="conference-card-title">{call.displayTitle}</h4>
                            </div>
                          </div>
                          <div
                            className="conference-card-body"
                            dangerouslySetInnerHTML={{ __html: call.summaryHtml }}
                          />
                          <div className="conference-card-footer">
                            <span className="conference-footnote">AI-enhanced markdown summary</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : (
                  <div className="panel-empty">Conference call summaries will appear here once generated.</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

CompanyAnalysisPage.displayName = 'CompanyAnalysisPage'

export default CompanyAnalysisPage
