# Deep Dive: Moving Average Setup Code

## 1. What “Moving Average Setup” Means Here

The codebase implements a **dual-MA trend-following system** that both **finds** and **runs** moving average setups:

- **Fast MA** (default 21) and **Slow MA** (default 50), configurable as EMA or SMA.
- **Entries:** Primary (close above/below slow MA) and re-entries (close above/below fast MA when trend still intact).
- **Exits:** Close beyond fast MA, trailing stop (ATR-based), or close beyond slow MA (trend break).
- **Modes:** Long only, short only, or both (one position at a time).

“Setup” = the rules + parameters that define when to enter/exit; the code both **finds** these setups (via optimization) and **runs** them (backtest + analysis).

---

## 2. Architecture Overview

| Layer | Role |
|-------|------|
| **Frontend (Angular)** | `ema-trading`: run analysis for one symbol, show trades/signals/chart. `ma-optimization`: run MA-pair optimization for one or many symbols. |
| **Backend (Node/Express)** | `ema.controller`: analyze one symbol, top performers, signals/summary. `optimization.controller`: optimize/compare MA pairs, heatmap. |
| **Engine** | `trading-engine.service.ts` (MATradingEngine): indicators (EMA/SMA, ATR, ADX), long/short signal generation, trade execution, metrics, equity curve. |
| **Data** | `getStockData()` from DB; chart MA from `app.ts` `calculateMovingAverages()` (21/50 only). |

Flow: **Angular form → API → EMA or Optimization controller → MATradingEngine (or MAOptimizer) → DB for price data → response → UI (tables + chart).**

---

## 3. Trading Engine (Core Logic)

**File:** `backend/src/services/trading-engine.service.ts`

### 3.1 Indicators

- **EMA:** First value is SMA of first `period` closes, then α = 2/(period+1) recurrence. Correct.
- **SMA:** Rolling window; correct.
- **ATR:** True Range then EMA-smoothed; stored with index offset +1 (TR starts at bar 1). Handled consistently.
- **ADX:** +DM/−DM, TR, smoothed, then +DI/−DI, DX, then EMA(DX). **Not used in signals** (computed but only on the engine’s internal path). Either use it (e.g. filter weak trend) or remove to avoid confusion.

### 3.2 Long Signal Logic (Summary)

- **Start:** Must have seen price **below** slow MA at least once (`wasBelowSlowMA`) before any long entry (avoids entering on first bar above 50 MA without prior context).
- **Entry 1 (new trend):** Not in trade, close **crosses above** slow MA (close > ma50, prev close ≤ ma50).
- **Entry 2 (re-entry):** Not in trade, have exited before, close **crosses above** fast MA, and fast MA > slow MA; re-entry count incremented.
- **Exit:** Checked **before** entry on the same bar so a day can close a trade and open the opposite (e.g. long → short) in mode “both”.
- **Exits:** (1) Close crosses below fast MA, (2) Close below trailing stop (long: stop = high since entry − ATR×mult), (3) Close below slow MA.

Trailing stop uses **close** for the “hit” check but **highest price since entry** for level; using high would be more conservative (stop only hit on a close below level).

### 3.3 Short Logic

Mirror of long: above slow MA requirement, close below slow MA for entry 1, below fast MA for re-entry, exits on close above fast MA, above trailing stop, or above slow MA. Stops are above price and move down with new lows. Consistent with `TRADING_RULES.md`.

### 3.4 Trade Execution

- Entry/exit prices: **next day’s open** after the signal close. Matches documented “signal on close, execute next open.”
- **Long:** `availableCapital -= shares * nextDayOpen` on entry, `+= shares * nextDayOpen` on exit. **Short:** capital increases on short entry and decreases on cover. P&L formulas: long `(exit - entry)*shares`, short `(entry - exit)*shares`. Correct.
- **Position sizing:** Long uses `positionSizingLong` (% of capital), re-entries at 50% of that. Short uses `positionSizingShort`, re-entries at 50%. Capital is updated by each trade’s P&L, so sizing is on current capital. One position at a time is enforced.
- **Open at end of backtest:** Closed at last bar’s close; P&L and duration computed correctly for long/short.

### 3.5 Equity Curve

```typescript
// generateEquityCurve: for each date in data, if that date is an exit_date of a trade, add trade.pnl to currentEquity
```

So equity is **only updated on exit dates**. The curve is step-wise (flat between exits, jump on close). Fine for “account balance after exits”; if you want mark-to-market or daily running capital, the logic would need to add daily P&L or revalue the open position each day.

### 3.6 Mean Reversion Alerts

Only when **in a trade** (date inside an entry→exit interval): if price > fast MA and distance % ≥ threshold, fire an alert; reset when distance drops below 50% of peak. Informational only; no impact on entries/exits.

### 3.7 Performance Metrics

Win rate, total P&L, return %, average duration, max drawdown (from cumulative P&L), Sharpe (from per-trade return %). Sharpe uses trade-level returns, not daily; optimizer uses a different Sharpe (per-trade return vs risk-free). Worth aligning definition (e.g. annualized daily vs trade-based) if you compare or rank strategies.

---

## 4. Backend API and Data

### 4.1 EMA Controller

- **POST /api/ema/analyze:** Body: symbol, capital, days, custom fast/slow MA, ATR, mean reversion, position sizing, ma_type, strategy_mode. Uses `getStockData(symbol, days)`, builds `StockData[]`, runs `MATradingEngine`, serializes dates to ISO. **Validation:** symbol required; data length ≥ 60; rejects if no trades or &lt; 3 trades (configurable thresholds).
- **GET /analyze/:symbol**, **/signals/:symbol**, **/summary/:symbol:** Same engine, different query params and response subsets. **GET /analyze and /signals/summary are not behind auth**; POST analyze and top-performers are. Worth aligning auth if all of these touch user-specific or heavy resources.
- **Top performers:** Reads precomputed `stock_performance_metrics` (symbol, total_return_pct, win_rate, sharpe, etc.) filtered by time period and strategy mode. So “best MA setups” here are whatever batch job populates that table, not live optimization.

### 4.2 Optimization Controller

- **MAOptimizer** builds (fast, slow) pairs from ranges and min distance, then for each pair runs `MATradingEngine` with custom fast/slow MA. No caching: every request recomputes all pairs.
- **GET /optimize/:symbol:** Query params for days, fast_range, slow_range, min_distance, capital, ATR, ma_type, strategy_mode. Returns best pair, top 5, all results, summary stats.
- **GET /compare-pairs/:symbol:** Pairs from query string (e.g. `10,20|21,50`). Same engine, fewer runs.
- **GET /heatmap/:symbol:** Same optimization, returns flat list of (fast_ma, slow_ma, value) for a chosen metric (return, sharpe, win_rate, profit_factor). Frontend could turn this into a 2D heatmap.
- Optimization uses **fixed** mean_reversion (10), position sizing (5% / 3%). So optimized “best MA pair” is under one fixed risk/sizing regime.

### 4.3 Chart MA in app.ts

`calculateMovingAverages` in `app.ts` only does **21 and 50**. When the user picks custom fast/slow (e.g. 10/30) in the trading page, the chart still shows 21/50 from this helper. So chart can disagree with the analysis. Fix: pass fast/slow from request (or from analysis response) and compute those periods in this helper, or compute MAs in the engine and return them with the analysis so the chart uses the same series.

---

## 5. Frontend (Angular)

### 5.1 EMA Trading Component

- **Form:** symbol, days, fastMa, slowMa, atrMultiplier, maType, meanReversionThreshold, strategyMode. Sends `custom_fast_ma` / `custom_slow_ma` and gets back trades, signals, metrics, equity curve.
- **User prefs:** Defaults for days, fast/slow MA, ATR, ma_type, mean reversion from `user.preferences`; column visibility from `trades_columns`. Good for UX.
- **Chart:** Loads stock data with `includeEma: true` and `maType` from form; chart service expects `ma_21` / `ma_50`. So with custom MAs, analysis uses custom but chart still shows 21/50 (same bug as backend chart endpoint).
- **Favorites:** Toggle favorite from results; “Optimize My Favorites” in MA optimization uses the same list. Coherent.
- **Combined signals:** BUY/SELL and mean reversion alerts merged and sorted by date for one table. Works.

### 5.2 MA Optimization Component

- **Form:** symbols (comma/space), days, fast/slow min/max, min distance, maType, strategyMode, capital, ATR. **Calls API per symbol:** `optimizeMA(symbol, request)` in a loop; no batch optimize endpoint.
- **Flow:** Sequential `for` loop over symbols, status per symbol (pending/running/complete/error), snackbar per symbol. For many symbols this is slow and blocks; consider backend batch endpoint + progress or at least parallel requests with a concurrency limit.
- **Results:** Single symbol → one card with top 5 table; multiple → accordion per symbol. Good. No heatmap UI yet (API supports it via `getHeatmapData`).

### 5.3 API Service

- `analyzeEMA` POST and `optimizeMA` GET with params match backend. `EMAAnalysisResponse` doesn’t include `position_type` on signals; backend can return SELL_SHORT / BUY_TO_COVER and position_type. Extend the response type if you show signal type in the UI.
- Chart and analysis use the same `getStockData(..., includeEma, maType)`; fixing chart MAs (backend or frontend) will align chart with analysis.

---

## 6. Improvement and Development Ideas

### 6.1 Correctness and Consistency

1. **Chart MAs vs analysis MAs**  
   Use the same fast/slow periods (and type) for the chart as for the run. Either:
   - extend `getStockData` (or analysis response) to accept/return custom fast/slow and use that in the chart, or  
   - have the backend return MA series with the analysis (e.g. `ma_fast`, `ma_slow` by date) and let the frontend chart those.

2. **ADX**  
   Either use ADX (e.g. require ADX &gt; 25 for entry, or expose as filter in UI) or remove its calculation to avoid “dead” code and confusion.

3. **Trailing stop definition**  
   Document whether “hit” is on close or on high/low. If you want stricter exits, consider using high (long) / low (short) for the stop check.

4. **Equity curve**  
   If the goal is “account value over time,” consider updating equity daily (e.g. mark-to-market open position + cash). If the goal is “balance after exits only,” current behavior is fine; just document it.

5. **Sharpe definition**  
   Unify how Sharpe is computed (trade-based vs daily, annualization) between engine and optimizer, and document it so rankings are comparable.

### 6.2 Performance and Scalability

6. **Optimization**  
   - Cache: same symbol + same params could cache optimizer results (e.g. in Redis or DB) with TTL.  
   - Batch: add an endpoint that accepts multiple symbols and returns optimization results (and optionally runs in a job queue).  
   - Parallelism: run multiple MA pairs in parallel (e.g. worker pool) to speed up single-symbol optimization.

7. **Heavy analysis**  
   For “analyze many symbols” or “optimize my favorites,” consider async jobs: return job id, poll or WebSocket for progress and result, so the UI doesn’t time out.

### 6.3 Features and Product

8. **Optimization scope**  
   Optimizer currently only varies (fast MA, slow MA). You could extend to ATR multiplier, position size, or even mean_reversion_threshold, with a grid or a smaller “sensitivity” set to avoid combinatorial explosion.

9. **Heatmap UI**  
   Backend already returns heatmap data. Add a view (e.g. in MA optimization) that plots a 2D grid (fast vs slow) colored by return or Sharpe to visualize robustness of MA pairs.

10. **Discovery vs “setups”**  
    Discovery uses precomputed metrics and favorites. To “find moving average setups” more explicitly you could:  
    - add a discovery filter “best MA pair” (from precomputed optimization results), or  
    - add a dedicated “MA setups” screen: run optimization for a universe (e.g. favorites or watchlist), show symbols sorted by best return/Sharpe and their best pair.

11. **Out-of-sample**  
    Optimization picks the best pair in-sample. Add a simple walk-forward or “train up to T, test from T to end” so the reported best pair is evaluated on unseen data and overfitting is visible.

12. **API types and auth**  
    - Add `position_type` (and signal types SELL_SHORT/BUY_TO_COVER) to `EMAAnalysisResponse` if the UI shows them.  
    - Put all analysis/optimization endpoints behind auth if they’re user-facing and resource-heavy, or document which are public.

### 6.4 Code Quality

13. **Engine**  
   - Extract long/short signal logic into smaller functions (e.g. “evaluate long exit,” “evaluate long entry”) to reduce duplication and make unit testing easier.  
   - Consider a single loop that evaluates both long and short conditions when strategy_mode is ‘both’, instead of merging two separate signal arrays (same result, clearer intent).

14. **Optimizer**  
   - MAOptimizer duplicates Sharpe/max drawdown/profit factor with the engine’s metrics. Prefer reusing the engine’s performance metrics where possible so definitions stay in one place.

15. **Tests**  
   Add unit tests for:  
   - EMA/SMA/ATR (known series → known outputs).  
   - One or two fixed price series with known entry/exit bars (e.g. one primary entry, one exit below fast MA).  
   - Trade execution (capital, shares, P&L for one long and one short).  
   This will make refactors and “continue development” safer.

---

## 7. Summary

- **Strengths:** Clear separation (engine vs API vs UI), documented rules in `TRADING_RULES.md`, correct signal-on-close / execute-next-open and long/short P&L, re-entries and “both” mode implemented consistently.
- **Main gaps:** Chart MA periods fixed at 21/50 while analysis can use custom MAs; ADX computed but unused; optimization is single-symbol and sequential; heatmap and discovery could better support “finding MA setups.”
- **Next steps that give the most leverage:** (1) Align chart MAs with analysis MAs, (2) add batch or parallel optimization and optional caching, (3) expose heatmap in the UI, (4) add a few engine/execution unit tests, (5) optionally use ADX or remove it, and (6) consider simple out-of-sample checks for optimized MA pairs.
