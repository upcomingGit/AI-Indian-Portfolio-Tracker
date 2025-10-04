import { useState, useMemo, useRef, useEffect } from 'react'
import './ResearchPage.css'

const CACHE_KEY = 'research_companies_cache'
const CACHE_TIMESTAMP_KEY = 'research_companies_cache_timestamp'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// Load cached companies from localStorage if available and not stale
function loadCachedCompanies() {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY)
    
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10)
      if (age < CACHE_DURATION) {
        return JSON.parse(cached)
      }
    }
  } catch (err) {
    console.warn('Failed to load cached companies:', err)
  }
  return []
}

// Save companies to localStorage
function cacheCompanies(companies) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(companies))
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
  } catch (err) {
    console.warn('Failed to cache companies:', err)
  }
}

export default function ResearchPage({ onBack, onCompanySelect }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showPillsDropdown, setShowPillsDropdown] = useState(false)
  const [companies, setCompanies] = useState(() => loadCachedCompanies())
  const [loading, setLoading] = useState(() => loadCachedCompanies().length === 0)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const searchInputRef = useRef(null)
  const dropdownRef = useRef(null)
  const pillsDropdownRef = useRef(null)
  

  // Fetch companies from backend on component mount
  useEffect(() => {
    const fetchCompanies = async () => {
      const cachedCompanies = loadCachedCompanies()
      
      try {
        if (cachedCompanies.length === 0) {
          setLoading(true)
        } else {
          setSyncing(true)
        }
        setError(null)
        const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/companies`)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        const remoteCompanies = Array.isArray(data?.companies) ? data.companies : []
        if (remoteCompanies.length > 0) {
          setCompanies(remoteCompanies)
          cacheCompanies(remoteCompanies)
        }
      } catch (err) {
        console.error('Failed to fetch companies:', err)
        setError(cachedCompanies.length > 0
          ? 'Failed to refresh companies. Showing cached list.'
          : 'Failed to load companies. Please try again.')
        if (cachedCompanies.length === 0) {
          setCompanies([])
        }
      } finally {
        setLoading(false)
        setSyncing(false)
      }
    }

    fetchCompanies()
  }, [])

  // Filter companies based on search term (immediate filtering to avoid showing all companies)
  const filteredCompanies = useMemo(() => {
    const s = searchTerm.trim().toLowerCase()
    if (!s) return []

    const results = companies.filter(company =>
      company.name.toLowerCase().startsWith(s)
    )

    return results
  }, [searchTerm, companies])

  // (dropdown will be rendered absolutely inside the search container to avoid layout shifts)

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Handle search dropdown
      if (searchInputRef.current && 
          !searchInputRef.current.contains(event.target) &&
          dropdownRef.current && 
          !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
      
      // Handle pills dropdown - check if click is outside both dropdown and toggle button
      if (pillsDropdownRef.current && 
          !pillsDropdownRef.current.contains(event.target) &&
          event.target.closest('.pills-toggle-btn') === null) {
        setShowPillsDropdown(false)
      }
    }

    if (showDropdown || showPillsDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown, showPillsDropdown])

  const handleViewDetails = (company) => {
    onCompanySelect(company.symbol)
    setShowDropdown(false)
  }

  const handleSearchFocus = () => {
    if (searchTerm) {
      setShowDropdown(true)
    }
  }

  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchTerm(value)
    setShowDropdown(value.trim().length > 0)
  }

  const handleSearchBlur = () => {
    // Small delay to allow dropdown clicks
    setTimeout(() => setShowDropdown(false), 200)
  }

  const togglePillsDropdown = () => {
    setShowPillsDropdown(!showPillsDropdown)
  }

  return (
    <div className="research-container">
      {/* Back button - positioned at top left */}
      <div className="back-button-section">
        <button 
          className="btn-secondary" 
          onClick={onBack}
          style={{ fontSize: '0.9rem' }}
        >
          ← Back to Home
        </button>
      </div>

      {/* Centered search section - positioned in lower half */}
      <div className="search-section">
        <div className="search-inner">
          {/* Main heading */}
          <h1 className="research-title">
            Deep Research Companies
          </h1>
          
          <p className="research-subtitle">
            Generated detailed company investment memos based on deep research and analysis.
          </p>

          {/* Search Bar */}
          <div className={"search-wrapper" + (showDropdown ? ' show-dropdown' : '')}>
            <div className="search-container">
              <input
                ref={searchInputRef}
                type="text"
                placeholder={loading ? "Loading companies..." : "Search for companies..."}
                value={searchTerm}
                onChange={handleSearchChange}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                className="search-input"
                aria-expanded={showDropdown}
                aria-controls="research-search-dropdown"
                disabled={loading && companies.length === 0}
              />

              {/* Search icon */}
              <div className="search-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="2" opacity="0.7"/>
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>

              {/* Loading indicator */}
              {loading && companies.length === 0 && (
                <div className="search-loading">
                  <div className="loading-spinner"></div>
                </div>
              )}

              {syncing && companies.length > 0 && (
                <div className="search-status" aria-live="polite">
                  Refreshing latest list…
                </div>
              )}

              {error && companies.length > 0 && (
                <div className="search-status" role="status">
                  {error}
                </div>
              )}

              {/* Error message */}
              {error && !loading && companies.length === 0 && (
                <div className="search-error">
                  <span>{error}</span>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="retry-button"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Dropdown (absolutely positioned inside the container to avoid layout shifts) */}
              {!loading && !error && showDropdown && searchTerm && (
                <div
                  id="research-search-dropdown"
                  ref={dropdownRef}
                  className="search-dropdown-absolute"
                >
                  {filteredCompanies.length > 0 ? (
                    <>
                      {filteredCompanies.map(company => (
                        <div
                          key={company.symbol}
                          className="search-dropdown-item"
                          onMouseDown={(e) => e.preventDefault()} /* prevent input blur before click */
                          onClick={() => handleViewDetails(company)}
                        >
                          <div className="search-dropdown-company-name">{company.name}</div>
                          <div className="search-dropdown-company-symbol">{company.symbol}</div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="search-dropdown-no-results">No companies found matching "{searchTerm}"</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Company Pills - now in a dropdown to avoid crowding */}
          <div className="company-pills-section">
            <div className="pills-dropdown-wrapper">
              <button 
                className="btn-secondary pills-toggle-btn"
                onClick={togglePillsDropdown}
                aria-expanded={showPillsDropdown}
                aria-controls="pills-dropdown"
                disabled={loading && companies.length === 0}
              >
                {loading ? 'Loading Companies...' : showPillsDropdown ? 'Hide Companies' : 'Browse All Companies'}
                {!loading && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '8px', transform: showPillsDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {showPillsDropdown && !loading && !error && (
                <div
                  id="pills-dropdown"
                  ref={pillsDropdownRef}
                  className="pills-dropdown"
                >
                  <div className="pills-dropdown-content">
                    {companies.map((company) => (
                      <button
                        key={company.symbol}
                        onClick={() => {
                          handleViewDetails(company)
                          setShowPillsDropdown(false)
                        }}
                        className="company-pill-dropdown"
                      >
                        <div className="pill-company-name">{company.name}</div>
                        <div className="pill-company-symbol">{company.symbol}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && !loading && companies.length === 0 && (
                <div className="pills-error">
                  <span>{error}</span>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="retry-button"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
