import './App.css'
import { useEffect, useState } from 'react'
import AnalysePage from './pages/AnalysePage'
import CompanyDetailPage from './pages/CompanyDetailPage'
import ResearchPage from './pages/ResearchPage'
import CompanyAnalysisPage from './pages/CompanyAnalysisPage'

function App() {
  const [route, setRoute] = useState('home')
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [portfolioLoaded, setPortfolioLoaded] = useState(() => {
    // Check localStorage for persisted portfolio state
    const saved = localStorage.getItem('portfolioLoaded')
    return saved === 'true'
  })
  const [portfolioData, setPortfolioData] = useState(() => {
    // Check localStorage for persisted portfolio data
    const saved = localStorage.getItem('portfolioData')
    try {
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  // Save portfolio state to localStorage whenever it changes
  const updatePortfolioLoaded = (loaded) => {
    setPortfolioLoaded(loaded)
    localStorage.setItem('portfolioLoaded', loaded.toString())
    if (!loaded) {
      localStorage.removeItem('portfolioData')
    }
  }

  const updatePortfolioData = (data) => {
    setPortfolioData(data)
    if (data) {
      localStorage.setItem('portfolioData', JSON.stringify(data))
    } else {
      localStorage.removeItem('portfolioData')
    }
  }

  // Initialize route based on URL
  useEffect(() => {
    const path = window.location.pathname
    if (path === '/coming-soon') {
      setRoute('coming-soon')
    } else if (path === '/research') {
      setRoute('research')
    } else if (path === '/analyse') {
      setRoute('analyse')
    } else if (path.startsWith('/company/')) {
      const symbol = path.split('/company/')[1]
      setSelectedCompany(symbol)
      setRoute('company-detail')
    } else if (path.startsWith('/analysis/')) {
      const symbol = path.split('/analysis/')[1]
      setSelectedCompany(symbol)
      setRoute('company-analysis')
    } else {
      setRoute('home')
    }
  }, [])

  useEffect(() => {
    const onPop = () => {
      const p = window.location.pathname
      if (p === '/coming-soon') {
        setRoute('coming-soon')
      } else if (p === '/research') {
        setRoute('research')
      } else if (p === '/analyse') {
        setRoute('analyse')
      } else if (p.startsWith('/company/')) {
        const symbol = p.split('/company/')[1]
        setSelectedCompany(symbol)
        setRoute('company-detail')
      } else if (p.startsWith('/analysis/')) {
        const symbol = p.split('/analysis/')[1]
        setSelectedCompany(symbol)
        setRoute('company-analysis')
      } else {
        setRoute('home')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigateTo = (r, symbol = null) => {
    if (r === 'coming-soon') {
      window.history.pushState({}, '', '/coming-soon')
    } else if (r === 'research') {
      window.history.pushState({}, '', '/research')
    } else if (r === 'analyse') {
      window.history.pushState({}, '', '/analyse')
    } else if (r === 'company-detail' && symbol) {
      window.history.pushState({}, '', `/company/${symbol}`)
      setSelectedCompany(symbol)
    } else if (r === 'company-analysis' && symbol) {
      window.history.pushState({}, '', `/analysis/${symbol}`)
      setSelectedCompany(symbol)
    } else {
      window.history.pushState({}, '', '/')
    }
    setRoute(r)
  }

  return (
    <div className="page">
      {/* Header */}
      <header className="site-header">
        <div className="container">
          <div className="brand">InvestR - Your AI-Powered Investment Memo Generator</div>
        </div>
      </header>

      {/* Main content */}
      <main className="site-main">
        {route === 'home' && (
          <div className="container hero">
            <h1 className="hero-title">Stay on top of Indian markets</h1>
            <p className="subtitle">Use the power of AI to research new companies or keep track of your existing companies</p>

            <div className="cards-grid">
              {/* Card 1 - navigates to Research */}
              <div
                className="card feature-card"
                role="button"
                tabIndex={0}
                onClick={() => navigateTo('research')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { navigateTo('research') } }}
                style={{ cursor: 'pointer' }}
              >
                <div className="icon-container">
                  <div className="icon-wrap">
                    {/* Search icon */}
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="2" opacity="0.9"/>
                      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>
                <div className="card-text-container">
                  <h3>Research new companies</h3>
                  <p className="muted">Discover fundamentals, filings, and signals before you invest.</p>
                </div>
              </div>

              {/* Card 2 - navigates to Analyse */}
              <div
                className="card feature-card"
                role="button"
                tabIndex={0}
                onClick={() => navigateTo('analyse')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { navigateTo('analyse') } }}
                style={{ cursor: 'pointer' }}
              >
                <div className="icon-container">
                  <div className="icon-wrap">
                    {/* Bell icon */}
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 3a5 5 0 0 0-5 5v2.6c0 .6-.2 1.2-.6 1.6L5 14h14l-1.4-1.8a2.4 2.4 0 0 1-.6-1.6V8a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>
                <div className="card-text-container">
                  <h3>Get updates on your portfolio companies</h3>
                  <p className="muted">Timely alerts on earnings, concalls, and regulatory changes.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {route === 'coming-soon' && (
          <div className="container hero">
            <div className="coming-soon-card">
              <h2>Coming Soon!</h2>
              <p>This capability is coming soon. We'll notify you when it's available!</p>
              <div style={{ marginTop: '1.2rem' }}>
                <button className="btn-primary" onClick={() => navigateTo('home')}>Return to Home</button>
              </div>
            </div>
          </div>
        )}

        {route === 'research' && (
          <ResearchPage 
            onBack={() => navigateTo('home')}
            onCompanySelect={(symbol) => navigateTo('company-analysis', symbol)}
          />
        )}

        {route === 'analyse' && (
          <AnalysePage 
            onBack={() => navigateTo('home')} 
            onCompanySelect={(symbol) => navigateTo('company-detail', symbol)}
            portfolioLoaded={portfolioLoaded}
            setPortfolioLoaded={updatePortfolioLoaded}
            portfolioData={portfolioData}
            setPortfolioData={updatePortfolioData}
          />
        )}

        {route === 'company-detail' && selectedCompany && (
          <CompanyDetailPage 
            symbol={selectedCompany}
            onBack={() => navigateTo('analyse')}
          />
        )}

        {route === 'company-analysis' && selectedCompany && (
          <CompanyAnalysisPage 
            symbol={selectedCompany}
            onBack={() => navigateTo('research')}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="container">
          <small>Made with ❤️ by Ankur Gupta</small>
        </div>
      </footer>
    </div>
  )
}

export default App
