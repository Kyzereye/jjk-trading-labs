#!/usr/bin/env python3
"""
Fetch 5 years of historical daily stock data using yfinance (Yahoo Finance)
and store in the existing MySQL database.

Run from get_stock_data directory:
  python src/scripts/fetch_5year_data.py

After fetching, run the TypeScript analysis to populate stock_performance_metrics:
  npm run fetch-5year -- --analysis-only
"""

import os
import sys
import time
import math
# Load .env from get_stock_data root (two levels up from src/scripts/)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(os.path.dirname(_script_dir))
import dotenv
dotenv.load_dotenv(os.path.join(_root, ".env"))

import yfinance as yf
import pymysql
from pymysql.cursors import DictCursor
from pymysql import err as pymysql_err


def get_connection():
    return pymysql.connect(
        host=os.environ.get("MYSQL_HOST", "localhost"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ.get("MYSQL_DATABASE", "StockPxLabs"),
        cursorclass=DictCursor,
    )


def get_all_symbols(conn) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT symbol FROM stock_symbols ORDER BY symbol")
        return [row["symbol"] for row in cur.fetchall()]


def get_symbol_id(conn, symbol: str) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM stock_symbols WHERE symbol = %s", (symbol.upper(),))
        row = cur.fetchone()
        if row:
            return row["id"]
        cur.execute(
            "INSERT INTO stock_symbols (symbol, company_name) VALUES (%s, %s)",
            (symbol.upper(), symbol.upper()),
        )
        conn.commit()
        return cur.lastrowid


def store_stock_data(conn, symbol_id: int, rows: list[tuple]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        query = """
            INSERT INTO daily_stock_data (symbol_id, date, open, high, low, close, volume)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                open = VALUES(open),
                high = VALUES(high),
                low = VALUES(low),
                close = VALUES(close),
                volume = VALUES(volume)
        """
        data = [(symbol_id, d, o, h, l, c, v) for (d, o, h, l, c, v) in rows]
        cur.executemany(query, data)
        conn.commit()


# DECIMAL(10,2) range in MySQL
_PRICE_MAX = 99_999_999.99
_PRICE_MIN = -99_999_999.99


def _sanitize_price(x) -> float:
    """Replace NaN/Inf and clamp to DECIMAL(10,2) range so MySQL accepts it."""
    if x is None:
        return 0.0
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(v) or math.isinf(v):
        return 0.0
    if v > _PRICE_MAX:
        return _PRICE_MAX
    if v < _PRICE_MIN:
        return _PRICE_MIN
    return v


def _sanitize_volume(x) -> int:
    """Replace NaN/Inf and ensure non-negative int for BIGINT."""
    if x is None:
        return 0
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0
    if math.isnan(v) or math.isinf(v) or v < 0:
        return 0
    return int(v)


def fetch_stock_data(symbol: str) -> list[tuple]:
    """Fetch ~5 years of daily data from Yahoo Finance. Returns list of (date, open, high, low, close, volume)."""
    try:
        ticker = yf.Ticker(symbol)
        # period "5y" = 5 years; interval "1d" = daily
        df = ticker.history(period="5y", interval="1d")
        if df is None or df.empty:
            return []
        rows = []
        for ts, row in df.iterrows():
            d = ts.date() if hasattr(ts, "date") else ts
            o = _sanitize_price(row.get("Open"))
            h = _sanitize_price(row.get("High"))
            low = _sanitize_price(row.get("Low"))
            c = _sanitize_price(row.get("Close"))
            v = _sanitize_volume(row.get("Volume"))
            rows.append((d, o, h, low, c, v))
        return rows
    except Exception as e:
        print(f"  Error fetching {symbol}: {e}", file=sys.stderr)
        return []


def main():
    print("Starting 5-year data fetch (yfinance) -> MySQL...")
    print("Symbols are read from stock_symbols; data is written to daily_stock_data.\n")

    conn = get_connection()
    try:
        symbols = get_all_symbols(conn)
        if not symbols:
            print("No symbols in stock_symbols. Populate that table first (e.g. run your SQL script).")
            sys.exit(1)
        print(f"Found {len(symbols)} symbols.\n")

        success = 0
        failed = 0
        failed_list = []

        for i, symbol in enumerate(symbols, 1):
            print(f"[{i}/{len(symbols)}] {symbol}...", end=" ", flush=True)
            rows = fetch_stock_data(symbol)
            if not rows:
                failed += 1
                failed_list.append((symbol, "No data"))
                print("no data")
            else:
                try:
                    symbol_id = get_symbol_id(conn, symbol)
                    store_stock_data(conn, symbol_id, rows)
                    success += 1
                    print(f"stored {len(rows)} days")
                except pymysql_err.DataError as e:
                    failed += 1
                    failed_list.append((symbol, f"Insert failed: {e}"))
                    print("insert failed")
            time.sleep(0.1)  # gentle rate limit

        print("\n" + "=" * 60)
        print("Summary")
        print("=" * 60)
        print(f"Stored: {success} symbols")
        print(f"Failed: {failed} symbols")
        if failed_list:
            print("\nSymbols with issues:")
            for sym, reason in failed_list:
                print(f"  • {sym}: {reason}")
        print("\nTo run performance analysis on this data, run:")
        print("  npm run fetch-5year -- --analysis-only")
        print("=" * 60)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
