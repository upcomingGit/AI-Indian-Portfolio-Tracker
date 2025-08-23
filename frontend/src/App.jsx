import './App.css'
import { useEffect, useState } from 'react'

function App() {
  const initialRoute = window.location.pathname === '/coming-soon' ? 'coming-soon' : 'home'
  const [route, setRoute] = useState(initialRoute)

  useEffect(() => {
    const onPop = () => {
      setRoute(window.location.pathname === '/coming-soon' ? 'coming-soon' : 'home')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigateTo = (r) => {
    if (r === 'coming-soon') {
      window.history.pushState({}, '', '/coming-soon')
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
          <div className="brand">InvestR - Your AI-Powered Portfolio Tracker</div>
        </div>
      </header>

      {/* Main content */}
      <main className="site-main">
        {route === 'home' && (
          <div className="container hero">
            <h1 className="hero-title">Stay on top of Indian markets</h1>
            <p className="subtitle">Use the power of AI to research new companies or keep track of your existing companies</p>

            <div className="cards-grid">
              {/* Card 1 - navigates to Coming Soon */}
              <div
                className="card feature-card"
                role="button"
                tabIndex={0}
                onClick={() => navigateTo('coming-soon')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { navigateTo('coming-soon') } }}
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

              {/* Card 2 */}
              <div className="card feature-card">
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
              <p>This capability is coming soon. We'll notify you when it's available.</p>
              <div style={{ marginTop: '1.2rem' }}>
                <button className="btn-primary" onClick={() => navigateTo('home')}>Return to Home</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="container">
          <small>Made by Ankur Gupta</small>
        </div>
      </footer>
    </div>
  )
}

export default App
