# Dashboard simplification (MVP / early product)

This document captures suggestions for making the dashboard simpler and clearer so early users can get value without being overwhelmed.

## Dashboard MVP scope (current focus)

The **dashboard** shows only:

1. **Trading alerts** — pattern-based alerts (same rules/source as the product’s alert pipeline).
2. **Favorites** — stock watchlist (favorites only).
3. **Top performers (two small lists)**  
   - **Top 3** symbols for **long setups** (`strategy_mode`: long).  
   - **Top 3** symbols for **short setups** (`strategy_mode`: short).  
   - Columns on the dashboard: **rank**, **symbol**, **company name** only (no extra metrics in this view).

**Ranking rule (fixed):** both lists are sorted **only** by **`total_return_pct`** (descending). Do not use Sharpe or win rate for these dashboard lists.

**Data definition (non-ambiguous):** lists come from precomputed **`stock_performance_metrics`**, via the existing top-performers flow: **`time_period` = `1Y`**, **`strategy_mode`** = `long` or `short`, **latest `analysis_date`** for that period + mode, and **`min_trades` = 5** (exclude symbols with fewer completed trades in that slice). “Performer” here means that stored backtest **total return %** for the MA setup rules for that mode—not user P&amp;L.

**Out of scope on the dashboard for now:** full trade analysis UI, MA optimization, and the dedicated **top performers** tab/experience—those come later.

## Principles

1. **One primary job per screen**  
   Decide what the dashboard is *for* on day one—for example:
   - “Today’s watchlist + alerts”, **or**
   - “Top ideas this week”  
   Avoid trying to be everything at once.

2. **Reduce what appears above the fold**  
   Aim for **3–5 focused elements** in the first view, for example:
   - Favorites / watchlist status
   - Top few alerts or signals  
   - One clear call-to-action (e.g. “Open trading”, “View top performers”)

3. **Progressive disclosure**  
   - Use summary rows with “expand” for details (full alert text, links to charts).  
   - Move secondary content behind **tabs** or a **“More”** section: discovery lists, deep stats, admin-style lists.

4. **Clear visual hierarchy**  
   - **Primary**: what needs attention *today* (alerts, actionable signals).  
   - **Secondary**: exploration (discovery, long lists).  
   - **Tertiary**: settings, symbol management, admin—link out instead of embedding large blocks on the main dashboard.

5. **Consistent language**  
   Align UI labels with the product vocabulary (e.g. alerts, signals, top performers) so users aren’t guessing what each block does.

6. **Empty and error states**  
   Prefer short copy + a next step over blank areas:
   - “No alerts yet — add favorites”  
   - “No analysis yet — run the data pipeline”

## What to de-emphasize or relocate for MVP

- Long discovery grids on the same page as alerts and favorites.  
- Multiple competing “headline” metrics without a single story.  
- Admin or power-user tools mixed into the default landing experience.

## Summary

For an early release, the dashboard should answer **“What should I look at right now?”** in one screen. Everything else can live behind navigation, tabs, or secondary pages once users are comfortable with the core loop.
