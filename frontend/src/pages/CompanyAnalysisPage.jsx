import { useState, useEffect, useMemo, memo, useCallback, startTransition } from 'react'
import './CompanyAnalysisPage.css'
import { useCompanyAnalysis } from '../hooks/useCompanyAnalysis'

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

const CompanyAnalysisPage = memo(({ symbol, onBack }) => {
  const { data: analysisData, loading, error } = useCompanyAnalysis(symbol)
  const [currentPage, setCurrentPage] = useState(0)
  const [itemsPerPage, setItemsPerPage] = useState(8)

  // Adjust items per page based on viewport height (approx card height 140px)
  useEffect(() => {
    const calc = () => {
      const h = window.innerHeight
      const possible = Math.max(4, Math.floor((h - 480) / 140))
      setItemsPerPage(possible)
    }
    let frame
    const onResize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(calc) }
    calc()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(frame) }
  }, [])

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
      {/* Header */}
      <div className="analysis-header">
        <button className="btn-back" onClick={onBack}>
          ← Back to Research
        </button>
        <div className="company-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', width: '100%', textAlign: 'center' }}>
          <h1 className="company-title" style={{ margin: 0 }}>{analysisData.companyName}</h1>
          <div className="company-symbol" style={{ fontSize: '1.2rem', marginTop: '2px' }}>{symbol}</div>
        </div>
      </div>

      {/* Quick Summary */}
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

      {/* Caveats */}
      {processedData.caveats.length > 0 && (
        <div className="caveats-section">
          <h2 className="section-title">Key Risks & Considerations</h2>
          <div className="caveats-list">
            {processedData.caveats.map((caveat, index) => {
              return (
                <div key={index} className="caveat-item" dangerouslySetInnerHTML={{ __html: '⚠️ ' + renderInlineMarkdown(caveat) }} />
              )
            })}
          </div>
        </div>
      )}

      {/* : trix */}
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

      {/* Metrics Section with Pagination */}
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

        {/* Pagination */}
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

      {/* Metadata */}
      {processedData.generatedAt && (
        <div className="analysis-metadata">
          <small>Analysis generated on {new Date(processedData.generatedAt).toLocaleDateString()}</small>
        </div>
      )}
    </div>
  )
})

CompanyAnalysisPage.displayName = 'CompanyAnalysisPage'

export default CompanyAnalysisPage
