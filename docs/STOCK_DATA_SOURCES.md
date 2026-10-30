# Stock Data Sources: APIs & Scraping

**Use case:** Date, open, high, low, close, volume (OHLCV) for **~2,314 symbols**, **last 3 years** of daily data, **once per day** (end of day). No real-time or intraday requirement.

---

## API Services

### Alpha Vantage
- **Site:** [alphavantage.co](https://www.alphavantage.co/)
- **Data:** Daily/weekly/monthly OHLCV, 20+ years history, 200k+ tickers.
- **Pricing:**  
  - **Free:** 25 API requests per day (lifetime).  
  - **Premium:** Paid plans for higher volume (see site).
- **Fit for 2,314 symbols once/day:** No. Free tier = 25 calls/day, so you’d need ~93 days to pull 2,314 symbols once each, or a paid plan with enough daily calls.

---

### Polygon.io (now “Massive”)
- **Site:** [polygon.io](https://polygon.io/) / [Massive](https://polygon.io/pricing)
- **Data:** US equities, EOD and minute aggregates, corporate actions, 2–20+ years history by plan.
- **Pricing:**  
  - **Stocks Basic (free):** $0/mo. 5 calls/min, 300/hour. EOD only, **2 years** history, all US tickers.  
  - **Stocks Starter:** $29/mo. Unlimited calls, **5 years** history.  
  - **Stocks Developer:** $79/mo. **10 years** history.  
  - **Stocks Advanced:** $199/mo. Real-time, **20+ years** history.
- **Fit for 2,314 symbols once/day:** Free: 2,314 requests at 5/min ≈ 7.7 hours; 2 years only (not 3). For 3 years, need at least Starter ($29/mo).

---

### Financial Modeling Prep (FMP)
- **Site:** [financialmodelingprep.com](https://intelligence.financialmodelingprep.com/pricing-plans)
- **Data:** EOD historical (OHLCV, VWAP), fundamentals, news, 5–30 years by plan.
- **Pricing:**  
  - **Basic (free):** $0/mo. **250 calls/day**, EOD historical.  
  - **Starter:** ~$22/mo (annual). 300 calls/min, up to 5 years history.  
  - **Premium:** ~$59/mo (annual). 750 calls/min, up to 30 years.  
  - **Ultimate:** ~$149/mo (annual). 3,000 calls/min, global.
- **Fit for 2,314 symbols once/day:** Free = 250/day → ~10 days to cover 2,314 symbols once. Starter or higher if you want all in one day; confirm batch/history endpoints for 3 years in one call.

---

### Finnhub
- **Site:** [finnhub.io](https://finnhub.io/)
- **Data:** Historical OHLC (candles), 30+ years for US on premium; free tier limits intraday to 1 month.
- **Pricing:**  
  - **Free:** $0/mo. 60 calls/min. Full historical daily OHLC for US (check current docs for exact limits).  
  - **All-In-One:** $3,000/mo. 900 calls/min, full history.
- **Fit for 2,314 symbols once/day:** Free may work for daily history only; verify “daily candle” limits. Premium is expensive for this use case.

---

### Tiingo
- **Site:** [tiingo.com](https://www.tiingo.com/)
- **Data:** EOD prices, 50+ years history, 37k+ tickers (US, ADRs, ETFs, etc.).
- **Pricing:**  
  - **Starter (free):** 10,000 requests/hour, 100,000/day, EOD included.  
  - **Power (Individual):** Paid (see site).  
  - **Business:** Paid.
- **Fit for 2,314 symbols once/day:** Yes. 2,314 requests/day is under free limits. Good candidate for “once at EOD, 3 years history” if one request per symbol returns enough history (check `startDate`/range limits).

---

### Twelve Data
- **Site:** [twelvedata.com](https://twelvedata.com/)
- **Data:** Daily and intraday OHLCV, multiple intervals, long history (e.g. daily back to 1980s for many symbols).
- **Pricing:**  
  - **Basic:** Free (credit-limited).  
  - **Grow:** $79/mo ($66/mo annual).  
  - **Pro:** $229/mo ($191/mo annual).  
  - **Ultra:** $999/mo.
- **Fit for 2,314 symbols once/day:** Depends on free credit allowance (likely tight). Paid Grow/Pro if you need 2,314 symbols daily within their rate/credit limits.

---

### Marketstack (APILayer)
- **Site:** [marketstack.com](https://marketstack.com/)
- **Data:** EOD historical, 170k+ tickers, 70+ exchanges, splits/dividends adjusted.
- **Pricing:**  
  - **Free:** $0. 100 requests/month, 1 year history.  
  - **Basic:** $9.99/mo. 10,000 requests/month.  
  - **Professional:** $49.99/mo. 100,000 requests/month, 15+ years history.  
  - **Business:** $149.99/mo. 500,000 requests/month.
- **Fit for 2,314 symbols once/day:** 2,314/day × 30 ≈ 70k/month. Free/Basic insufficient. **Professional ($49.99/mo)** fits.

---

### FinImpulse
- **Site:** [finimpulse.com](https://finimpulse.com/)
- **Data:** 614k+ tickers, 98 markets, 20+ years OHLCV, USD-normalized, corporate actions.
- **Pricing:** Pay-as-you-go, **$0.00012 per call** (historical). No minimum/subscription stated.
- **Fit for 2,314 symbols once/day:** If one call per symbol per day: 2,314 × $0.00012 ≈ **$0.28/day** (~$8.50/mo). Confirm whether one call returns 3 years or you need multiple calls per symbol.

---

### Eulerpool
- **Site:** [eulerpool.com](https://eulerpool.com/financial-data-api)
- **Data:** 100k+ tickers, 90+ exchanges, 100+ years history, OHLCV, splits/dividends, point-in-time.
- **Pricing:** Free tier available; paid tiers not fully detailed in search results.
- **Fit for 2,314 symbols once/day:** Check free-tier rate and history limits; if sufficient, viable.

---

### StockData.org
- **Site:** [stockdata.org](https://www.stockdata.org/)
- **Data:** 150k+ tickers, 70 exchanges, intraday (7+ years), EOD, news.
- **Pricing:** Free: **100 requests/day** (no credit card).
- **Fit for 2,314 symbols once/day:** No. 100/day is too low for 2,314 symbols in one day.

---

## Summary Table (for ~2,314 symbols, 3 years daily OHLCV, once/day)

| Provider        | Free tier enough? | Paid option (if needed)   | Notes                          |
|----------------|-------------------|---------------------------|--------------------------------|
| Alpha Vantage  | No (25/day)       | Premium plans             | Too few free calls.            |
| Polygon/Massive| 2y only           | $29/mo (5y)               | Free = 2y history only.        |
| FMP            | ~10 days to run   | ~$22/mo                  | 250 free/day.                  |
| Finnhub        | Maybe (verify)    | $3,000/mo                 | Confirm free daily history.   |
| **Tiingo**     | **Yes**           | Optional                  | 100k req/day free.             |
| Twelve Data    | Check credits     | $79–229/mo                | Credit-based.                  |
| Marketstack    | No                | $49.99/mo (Pro)           | 100k req/month.                |
| FinImpulse     | N/A               | ~$0.28/day pay-as-you-go | Per-call pricing.              |
| Eulerpool      | Check             | See site                  | Free tier exists.              |
| StockData.org  | No (100/day)      | —                         | Too low.                       |

**Best free/low-cost fit for “2,314 symbols, 3 years, once per day”:** **Tiingo** (free tier) and **FinImpulse** (pay-per-call). Then **Polygon Starter** or **FMP Starter** if you want a fixed monthly plan.

---

## Reliable Scraping / Unofficial Methods

**Context:** Yahoo Finance (and libraries like **yfinance** in Python or **yahoo-finance2** in Node) use unofficial endpoints. As of **2026**, Yahoo enforces **stricter rate limiting (HTTP 429)** and does not publish limits. Scraping is not “reliable” in the sense of guaranteed uptime or throughput.

### yfinance (Python)

- **What it is:** Python library that hits Yahoo’s same chart/historical endpoints.
- **Data:** Same OHLCV you need; can request multi-year daily history per ticker.
- **Reliability:** Subject to same 429s and blocks as any Yahoo client. Not more reliable than Node for bulk; often **same backend**.

**Ways to reduce 429s (no guarantee):**

1. **Delays:** e.g. 2–5+ seconds between tickers; randomize (e.g. 1–3 s) to look less robotic.
2. **Caching:** Use `requests_cache` / `CachedSession` so repeated runs don’t re-hit Yahoo for the same symbol/range.
3. **Rate limiter:** e.g. cap at 1–2 requests per 5 seconds.
4. **Newer yfinance (0.2.58+):** Better handling of Yahoo’s responses; use latest version.
5. **TLS/UA impersonation (advanced):** Some users report fewer blocks with `curl_cffi` using Chrome impersonation + caching + strict rate limit (e.g. 2 requests per 5 seconds). Still not “reliable” long-term.

**Example pattern (delays + cache):**

```python
import time, random
import yfinance as yf
# Optional: session with cache to avoid re-requesting same data
# import requests_cache
# session = requests_cache.CachedSession('yfinance.cache')

for ticker in tickers:
    time.sleep(random.uniform(2.0, 5.0))
    data = yf.Ticker(ticker).history(period="3y", interval="1d")
    # then map to date, open, high, low, close, volume
```

**Verdict:** Scraping Yahoo (via yfinance or Node) can work with heavy throttling and caching but is **not reliable** for 2,314 symbols in one run every day; 429s and blocks are common. Prefer an **API with a documented free or low-cost tier** (e.g. Tiingo, FinImpulse, Polygon, FMP) for “reliable” daily EOD data.

---

## Recommendation for Your Setup

- **Target:** 2,314 symbols × 3 years daily OHLCV, once per day at EOD.
- **Preferred:** Sign up for **Tiingo** and use their EOD historical endpoint (one request per symbol with a 3-year range, or batch if they support it). Stay within 100k requests/day free.
- **Alternative:** **FinImpulse** pay-per-call (~$0.28/day) if you want minimal commitment.
- **If you must use Yahoo:** Use **yfinance** or **yahoo-finance2** with **long delays** (e.g. 5+ s between symbols), **retries with backoff**, and **caching**; expect runs to take hours and occasional 429s. Treat as fallback, not primary.

---

*Document created for JJK Trading Labs. Pricing and limits can change; verify on each provider’s site before committing.*
