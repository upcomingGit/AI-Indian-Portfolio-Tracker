#!/usr/bin/env python3
"""
Company Analyser - Analyze Indian company markdown files using Google Gemini
"""

import argparse
import os
import sys
from pathlib import Path
from google import genai
import yfinance as yf
import pandas as pd
from datetime import datetime
import requests
import json
from dotenv import load_dotenv


# Global API base URL for financial data
API_BASE_URL = os.getenv(
    'API_BASE_URL',
    'https://api-indian-financial-markets-485071544262.asia-south1.run.app'
)


def configure_gemini_client():
    """Configure Gemini client with API key"""
    load_dotenv(override=False)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set")
        sys.exit(1)
    return genai.Client()


def fetch_historical_prices(symbol):
    """
    Fetch 10-year historical stock prices at monthly intervals
    
    Args:
        symbol (str): Stock symbol without exchange suffix
    
    Returns:
        pandas.DataFrame or None: Historical price data or None if failed
    """
    # Try NSE first, then BSE
    exchanges = ['.NS', '.BO']
    
    for exchange in exchanges:
        full_symbol = symbol + exchange
        print(f"Trying to fetch data for {full_symbol}...")
        
        try:
            ticker = yf.Ticker(full_symbol)
            hist = ticker.history(period="10y", interval="1mo")
            
            if not hist.empty:
                print(f"Successfully fetched data for {full_symbol}")
                # Return only closing prices with date
                closing_prices = hist[['Close']].copy()
                closing_prices.reset_index(inplace=True)
                closing_prices['Date'] = closing_prices['Date'].dt.date
                closing_prices['Symbol'] = full_symbol
                return closing_prices
                
        except Exception as e:
            print(f"Error fetching data for {full_symbol}: {str(e)}")
            continue
    
    print(f"No data found for symbol: {symbol} on either NSE or BSE")
    return None


def fetch_financial_data(symbol, api_base_url=None):
    """
    Fetch financial statement data from the API (consolidated first, then standalone)
    
    Args:
        symbol (str): Stock symbol without exchange suffix
        api_base_url (str): Base URL for the financial API
    
    Returns:
        dict or None: Financial data JSON or None if failed
    """
    # Try standalone first, then consolidated
    financial_types = ['standalone', 'consolidated']

    if not api_base_url:
        api_base_url = API_BASE_URL

    for fin_type in financial_types:
        url = f"{api_base_url}/companies/{symbol}/financials/{fin_type}"
        print(f"Trying to fetch {fin_type} financial data from {url}...")
        
        try:
            response = requests.get(url, timeout=30)
            if response.status_code == 200:
                financial_data = response.json()
                print(f"Successfully fetched {fin_type} financial data for {symbol}")
                return financial_data
            elif response.status_code == 404:
                print(f"No {fin_type} financial data found for {symbol}")
                continue
            else:
                print(f"API returned status {response.status_code} for {fin_type} financials")
                continue
                
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {fin_type} financial data: {str(e)}")
            continue
    
    print(f"No financial data found for symbol: {symbol}")
    return None


def format_financial_data_to_markdown(financial_data):
    """
    Convert financial data JSON to markdown tables for better LLM readability
    
    Args:
        financial_data (dict): Financial data from API
    
    Returns:
        str: Markdown formatted financial statements
    """
    if not financial_data or 'financials' not in financial_data:
        return "No financial data available."
    
    markdown_parts = []
    financials = financial_data.get('financials', {})
    
    for statement_type, items in financials.items():
        # Create table header
        markdown_parts.append(f"### {statement_type.replace('-', ' ').title()}")
        markdown_parts.append("")
        
        if not items:
            markdown_parts.append("No data available for this statement.")
            markdown_parts.append("")
            continue
        
        # Build union of all column keys (years/TTM) across items
        all_keys = set()
        for it in items:
            data = it.get('data', {}) or {}
            all_keys.update(list(data.keys()))

        # Order keys: put 'TTM' first if present, then sort remaining keys chronologically
        keys = []
        if 'TTM' in all_keys:
            keys.append('TTM')
            all_keys.remove('TTM')

        # Try to sort by year-like strings (e.g., 'Mar 2014'); non-year strings sort after
        def sort_key(k):
            try:
                # Extract year number if present at end
                parts = str(k).split()
                year = int(parts[-1])
                return (0, year)
            except Exception:
                return (1, str(k))

        other_keys = sorted(list(all_keys), key=sort_key)
        keys.extend(other_keys)
        
        if not keys:
            markdown_parts.append("No yearly data available.")
            markdown_parts.append("")
            continue

        # Create markdown table header
        header_row = "| Item | " + " | ".join(keys) + " |"
        separator_row = "|------|" + "|".join(["------"] * len(keys)) + "|"
        markdown_parts.append(header_row)
        markdown_parts.append(separator_row)
        
        # Add data rows
        for item in items:
            item_name = item.get('item', 'Unknown')
            item_data = item.get('data', {})
            
            row_values = []
            for year in keys:
                raw_value = item_data.get(year, None)
                # Normalize and format values
                formatted_value = 'N/A'
                if raw_value is None:
                    formatted_value = 'N/A'
                else:
                    # numeric types
                    if isinstance(raw_value, (int, float)):
                        # Keep two decimals for small numbers, commas for large
                        if abs(raw_value) >= 1000:
                            formatted_value = f"{raw_value:,.0f}"
                        else:
                            # If it's effectively integer, show without decimals for clarity
                            if float(raw_value).is_integer():
                                formatted_value = f"{int(raw_value)}"
                            else:
                                formatted_value = f"{raw_value:.2f}"
                    else:
                        # Strings: could be percentages or numeric strings
                        s = str(raw_value)
                        if s.strip() == '' or s.lower() == 'null':
                            formatted_value = 'N/A'
                        else:
                            # Preserve percentage strings and numeric-like strings
                            if s.endswith('%'):
                                formatted_value = s
                            else:
                                # Try to parse as float
                                try:
                                    v = float(s.replace(',', ''))
                                    if abs(v) >= 1000:
                                        formatted_value = f"{v:,.0f}"
                                    else:
                                        if v.is_integer():
                                            formatted_value = f"{int(v)}"
                                        else:
                                            formatted_value = f"{v:.2f}"
                                except Exception:
                                    formatted_value = s
                row_values.append(formatted_value)
            
            data_row = f"| {item_name} | " + " | ".join(row_values) + " |"
            markdown_parts.append(data_row)
        
        markdown_parts.append("")  # Add spacing between tables
    
    return "\n".join(markdown_parts)


def read_markdown_file(file_path):
    """Read and return the content of a markdown file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read()
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)


def find_company_kb_file(symbol, kb_dir=None):
    """Search the Company_KB_Articles directory for a markdown file matching the symbol.

    Matching strategy:
    - Case-insensitive contains on filename (e.g., 'RELIANCE' matches 'Reliance.md' or 'RELIANCE.NS.md')
    - Return first match found.
    """
    if kb_dir is None:
        # try relative path: go up to workspace root and reference sibling repo
        # Path(__file__).resolve().parents[3] points to the parent that contains both
        # 'AI-Indian-Portfolio-Tracker' and 'api-indian-financial-markets'
        kb_dir = Path(__file__).resolve().parents[3] / 'api-indian-financial-markets' / 'Company_KB_Articles'

    if not kb_dir.exists() or not kb_dir.is_dir():
        return None

    symbol_lower = symbol.lower()
    for p in kb_dir.glob('**/*.md'):
        name = p.stem.lower()
        if symbol_lower in name:
            return str(p)

    return None


def analyze_financials_with_gemini(client, price_data=None, financial_data=None):
    """First stage: Deep analysis of financial statements and historical prices using Gemini."""
    
    prompt_parts = [
        "You are a quantitative financial Indian equity research analyst specializing in Indian equity markets. Perform a deep numerical analysis",
        "of the provided financial statements and historical price data. Focus on:",
        "",
        "You will be given:",
        "- 10 years of company financial statements (Income Statement, Balance Sheet, Cash Flow).",
        "- 10 years of historical stock prices and valuation multiples (P/E, EV/EBITDA, etc.).",
        "- Sector/industry context if available.",
        "",
        "Your task is to analyze the company’s financial and stock market performance.",
        "Focus on **whether the business performance movement is correlated to the stock price movement**.",
        "",
        "Steps:",
        "",
        "1. **Financial Analysis**",
        "   - Identify trends in Revenue Growth, Net Profit Growth, EPS, Margins, ROCE, Debt/Equity, Free Cash Flow, Inventory Days, Receivable Days.",
        "   - For each trend, explain the likely drivers (e.g., demand cycles, cost structure, new product launches, capacity expansion, regulation, input cost inflation, sector growth, management decisions). If you can't find a reason, say so, but don't make up reasons.",
        "   - Clearly separate *what happened* (trend) from *why it happened* (factors).",
        "",
        "2. **Valuation & Market Performance**",
        "   - Summarize stock price CAGR, major drawdowns, re-ratings, and volatility.",
        "   - Compare stock performance with earnings growth.",
        "   - For periods of major price moves, explain the likely reasons (e.g., earnings surprise, sector re-rating, macroeconomic changes, regulatory events, investor sentiment) If you can't find reasons, explain so. Don't make up reasons.",
        "   - Highlight any discrepancies between stock price movement and business performance.",
        "",
        "3. **Drivers of Performance**",
        "   - Integrate financial and stock analysis into a coherent story.",
        "   - Highlight key external drivers (sector trends, macro factors, government policies, global environment).",
        "   - Highlight internal drivers (management execution, capital allocation, strategy shifts).",
        "",
        "4. **Conclusion**",
        "   - Provide a final synthesis:",
        "     - Are the financials improving or deteriorating, and why?",
        "     - Is the stock performance justified by fundamentals, or mainly by sentiment/re-rating?",
        ""
    ]
    
    # Add historical price data if available
    if price_data is not None and not price_data.empty:
        series = price_data[['Date', 'Close']].dropna().sort_values('Date')
        csv_lines = ["Date,Close"]
        for _, row in series.iterrows():
            csv_lines.append(f"{row['Date']},{row['Close']:.2f}")

        prompt_parts.extend([
            "HISTORICAL PRICE DATA (10-year monthly intervals):",
            f"Symbol: {price_data['Symbol'].iloc[0]}",
            "--BEGIN PRICE SERIES (CSV: Date,Close)---",
            "\n".join(csv_lines),
            "---END PRICE SERIES---",
            "",
        ])
    else:
        prompt_parts.append("HISTORICAL PRICE DATA: Not available")
        prompt_parts.append("")
    
    # Add financial data if available
    if financial_data is not None:
        financial_markdown = format_financial_data_to_markdown(financial_data)
        prompt_parts.extend([
            "FINANCIAL STATEMENT DATA:",
            f"Financial Type: {financial_data.get('financial_type', 'N/A')}",
            f"Sector: {financial_data.get('sector', 'N/A')}",
            "",
            financial_markdown,
        ])
    else:
        prompt_parts.append("FINANCIAL STATEMENT DATA: Not available")
        prompt_parts.append("")
    
    prompt = "\n".join(prompt_parts)
    print(f"Prompt length: {len(prompt)} characters with first 500 characters: {prompt[:500]}")

    try:
        print("Stage 1: Performing deep financial analysis...")
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt]
        )
        return response.text
    except Exception as e:
        print(f"Error in stage 1 financial analysis: {e}")
        sys.exit(1)


def analyze_company_comprehensive(client, markdown_content, financial_analysis, price_data=None, financial_data=None):
    """Second stage: Comprehensive company analysis incorporating deep financial insights."""
    # Load the Stage 2 comprehensive prompt from an external file so it can be edited
    # without modifying code. The file is expected to be next to this script.
    stage2_prompt_path = Path(__file__).resolve().parent / 'Stage2-DeepAnalysisPrompt.txt'
    try:
        with open(stage2_prompt_path, 'r', encoding='utf-8') as f:
            stage2_prompt = f.read()
    except Exception:
        # Fallback prompt if file is missing/unreadable
        stage2_prompt = (
            "You are a senior equity research analyst. You have been provided with:\n"
            "1. Company business information and fundamentals\n"
            "2. Deep financial and quantitative analysis from a specialist\n"
            "3. Raw financial data and historical prices\n\n"
            "Your task is to synthesize all this information into a comprehensive investment thesis.\n"
            "Provide insights on business analysis, investment perspective, and synthesis requirements."
        )

    prompt_parts = [
        stage2_prompt,
        "",
        "---COMPANY BUSINESS DRIVERS, MANAGEMENT QUALITY, COMPETITIVE AND SECTOR OUTLOOK INFORMATION---",
        markdown_content,
        "",
        "---DEEP FINANCIAL ANALYSIS---",
        financial_analysis,
        ""
    ]
    
    # Add raw financial data summary for context (converted to markdown for LLM)
    if financial_data is not None:
        financial_raw_markdown = format_financial_data_to_markdown(financial_data)
        prompt_parts.extend([
            "---RAW FINANCIAL DATA CONTEXT---",
            f"Financial Type: {financial_data.get('financial_type', 'N/A')}",
            f"Sector: {financial_data.get('sector', 'N/A')}",
            f"Available Statements: {list(financial_data.get('financials', {}).keys())}",
            "",
            "### Financial Statements (converted to markdown):",
            financial_raw_markdown,
            ""
        ])
    
    # Add price data summary for context
    if price_data is not None and not price_data.empty:
        current_price = price_data['Close'].iloc[-1]
        min_price = price_data['Close'].min()
        max_price = price_data['Close'].max()
        # Build CSV lines for full monthly series (Date,Close)
        series = price_data[['Date', 'Close']].dropna().sort_values('Date')
        csv_lines = ["Date,Close"]
        for _, row in series.iterrows():
            # Ensure date is ISO-like string
            csv_lines.append(f"{row['Date']},{row['Close']:.2f}")
        price_series_block = "\n".join(csv_lines)
        
        prompt_parts.extend([
            "---PRICE DATA CONTEXT---",
            f"Symbol: {price_data['Symbol'].iloc[0]}",
            f"Current Price: ₹{current_price:.2f}",
            f"10-Year Range: ₹{min_price:.2f} - ₹{max_price:.2f}",
            f"Total Records: {len(price_data)} monthly observations",
            "",
            "--BEGIN PRICE SERIES (CSV: Date,Close)---",
            price_series_block,
            "---END PRICE SERIES---",
            ""
        ])
    
    prompt = "\n".join(prompt_parts)
    
    try:
        print("Stage 2: Performing comprehensive company analysis...")
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt]
        )
        return response.text
    except Exception as e:
        print(f"Error in stage 2 comprehensive analysis: {e}")
        sys.exit(1)

def main():
    """Main function to orchestrate the analysis"""
    parser = argparse.ArgumentParser(description='Analyze Indian company markdown files using Google Gemini and historical price data')
    parser.add_argument('security_symbol', help='NSE/BSE security symbol (e.g., RELIANCE, TCS) - script will search Company_KB_Articles for the markdown')
    args = parser.parse_args()

    # Always search KB articles for the company markdown based on the provided symbol
    print(f"Searching KB for symbol {args.security_symbol} in Company_KB_Articles...")
    kb_file = find_company_kb_file(args.security_symbol)
    if not kb_file:
        print("No KB markdown found for the provided symbol. Please add the file to Company_KB_Articles or provide a markdown file manually.")
        sys.exit(1)

    print(f"Found KB markdown: {kb_file}")
    markdown_content = read_markdown_file(kb_file)
    print(f"Read {len(markdown_content)} characters from markdown file.")

    print(f"Fetching 10-year historical prices for {args.security_symbol}...")
    price_data = fetch_historical_prices(args.security_symbol)
    
    if price_data is not None:
        print(f"Successfully fetched {len(price_data)} monthly price records")
        print(f"Price range: ₹{price_data['Close'].min():.2f} - ₹{price_data['Close'].max():.2f}")
    else:
        print("Warning: Could not fetch historical price data. Analysis will proceed with markdown content only.")
    
    print(f"Fetching financial statement data for {args.security_symbol}...")
    financial_data = fetch_financial_data(args.security_symbol)
    
    if financial_data is not None:
        print(f"Successfully fetched {financial_data.get('financial_type', 'unknown')} financial statements")
        financials = financial_data.get('financials', {})
        print(f"Available statements: {list(financials.keys())}")
    else:
        print("Warning: Could not fetch financial statement data. Analysis will proceed without financial statements.")

    print("Configuring Gemini client...")
    client = configure_gemini_client()

    print("Starting two-stage analysis with Gemini...")
    
    # Stage 1: Deep financial analysis of raw data
    financial_analysis = analyze_financials_with_gemini(client, price_data, financial_data)

    #print(f"This is the financial analysis output:\n{financial_analysis}\n")

    # Stage 2: Comprehensive analysis incorporating business context
    final_analysis = analyze_company_comprehensive(client, markdown_content, financial_analysis, price_data, financial_data)

    # Output results
    output_file = f"{args.security_symbol}_Thesis.md"
    # Ensure markdown extension
    if not output_file.lower().endswith('.md'):
        output_file = output_file + '.md'

    # Create comprehensive output with both stages and write to disk
    comprehensive_output = f"""# {args.security_symbol} Investment Thesis
    ## Executive Summary
    {final_analysis}

    ---
    *Analysis generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} using two-stage Gemini analysis*
    """

    with open(output_file, 'w', encoding='utf-8') as file:
        file.write(comprehensive_output)
    print(f"Two-stage analysis saved to: {output_file}")


if __name__ == "__main__":
    main()
