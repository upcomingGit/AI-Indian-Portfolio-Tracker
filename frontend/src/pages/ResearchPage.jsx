import { useState, useMemo, useRef, useEffect } from 'react'
import './ResearchPage.css'

// List of available companies based on thesis files
const AVAILABLE_COMPANIES = [
  { symbol: 'TINNARUBR', name: 'Tinna Rubber & Infrastructure Ltd.' },
  { symbol: 'WONDERLA', name: 'Wonderla Holidays Ltd.' }
]

export default function ResearchPage({ onBack, onCompanySelect }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchInputRef = useRef(null)
  const dropdownRef = useRef(null)
  

  // Filter companies based on search term - fixed logic
  const filteredCompanies = useMemo(() => {
    if (!searchTerm.trim()) return AVAILABLE_COMPANIES
    
    const search = searchTerm.toLowerCase()
    return AVAILABLE_COMPANIES.filter(company => 
      company.name.toLowerCase().startsWith(search) || 
      company.symbol.toLowerCase().startsWith(search)
    )
  }, [searchTerm])

  // (dropdown will be rendered absolutely inside the search container to avoid layout shifts)

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchInputRef.current && 
          !searchInputRef.current.contains(event.target) &&
          dropdownRef.current && 
          !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

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
            Research Companies
          </h1>
          
          <p className="research-subtitle">
            Discover detailed investment analysis and insights for Indian companies
          </p>

  {/* Search Bar */}
  <div className={"search-wrapper" + (showDropdown ? ' show-dropdown' : '')}>
          <div className="search-container">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search for companies..."
              value={searchTerm}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              className="search-input"
              aria-expanded={showDropdown}
              aria-controls="research-search-dropdown"
            />

            {/* Search icon */}
            <div className="search-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="2" opacity="0.7"/>
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>

            {/* Dropdown (absolutely positioned inside the container to avoid layout shifts) */}
            {showDropdown && searchTerm && (
              <div
                id="research-search-dropdown"
                ref={dropdownRef}
                className="search-dropdown-absolute"
              >
                {filteredCompanies.length > 0 ? (
                  filteredCompanies.map(company => (
                    <div
                      key={company.symbol}
                      className="search-dropdown-item"
                      onMouseDown={(e) => e.preventDefault()} /* prevent input blur before click */
                      onClick={() => handleViewDetails(company)}
                    >
                      <div className="search-dropdown-company-name">{company.name}</div>
                      <div className="search-dropdown-company-symbol">{company.symbol}</div>
                    </div>
                  ))
                ) : (
                  <div className="search-dropdown-no-results">No companies found matching "{searchTerm}"</div>
                )}
              </div>
            )}
          </div>
        </div>

  {/* Company Pills - always rendered to avoid layout shifts; CSS will dim when dropdown open */}
  </div>
  <div className="company-pills-section">
          <p className="company-pills-text">
            Or explore these companies:
          </p>

          <div className="company-pills-container">
            {AVAILABLE_COMPANIES.map((company) => (
              <button
                key={company.symbol}
                onClick={() => handleViewDetails(company)}
                className="company-pill"
              >
                {company.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
