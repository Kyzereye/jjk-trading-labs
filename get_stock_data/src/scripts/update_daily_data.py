#!/usr/bin/env python3
"""
Update daily stock data: fetch new bars from Yahoo (yfinance) and store in MySQL.
Keeps only the last 3 years of data (cleanup after updates).

Run from get_stock_data directory:
  python src/scripts/update_daily_data.py
"""

import os
import sys
import time
import math
from datetime import datetime, timedelta, date

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


def get_latest_date(conn, symbol_id: int):
    """Return the latest date in daily_stock_data for this symbol_id, or None."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MAX(date) AS latest FROM daily_stock_data WHERE symbol_id = %s",
            (symbol_id,),
        )
        row = cur.fetchone()
        if row and row["latest"]:
            d = row["latest"]
            return d if isinstance(d, date) else d.date()
        return None


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


_PRICE_MAX = 99_999_999.99
_PRICE_MIN = -99_999_999.99


def _sanitize_price(x) -> float:
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
    if x is None:
        return 0
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0
    if math.isnan(v) or math.isinf(v) or v < 0:
        return 0
    return int(v)


def fetch_incremental(symbol: str, start_date: date, end_date: date) -> list[tuple]:
    """Fetch daily bars from start_date through end_date. Returns list of (date, open, high, low, close, volume)."""
    try:
        ticker = yf.Ticker(symbol)
        # yfinance expects datetime or string
        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date, datetime.min.time())
        df = ticker.history(start=start_dt, end=end_dt, interval="1d")
        if df is None or df.empty:
            return []
        rows = []
        for ts, row in df.iterrows():
            d = ts.date() if hasattr(ts, "date") else ts
            if d < start_date or d > end_date:
                continue
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


def cleanup_older_than_3_years(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM daily_stock_data WHERE date < DATE_SUB(CURDATE(), INTERVAL 3 YEAR)"
        )
        conn.commit()
        return cur.rowcount


def main():
    print("Starting daily data update (yfinance -> MySQL)...\n")

    conn = get_connection()
    try:
        symbols = get_all_symbols(conn)
        if not symbols:
            print("No symbols in stock_symbols. Populate that table first.")
            sys.exit(1)
        print(f"Found {len(symbols)} symbols to update.\n")

        today = date.today()
        success = 0
        failed = 0
        total_new = 0

        for i, symbol in enumerate(symbols, 1):
            print(f"[{i}/{len(symbols)}] {symbol}...", end=" ", flush=True)
            try:
                symbol_id = get_symbol_id(conn, symbol)
                latest = get_latest_date(conn, symbol_id)
                if latest:
                    start_date = latest + timedelta(days=1)
                else:
                    start_date = today - timedelta(days=30)

                if start_date > today:
                    print("up to date")
                    continue

                rows = fetch_incremental(symbol, start_date, today)
                if not rows:
                    print("no new data")
                    continue

                try:
                    store_stock_data(conn, symbol_id, rows)
                    total_new += len(rows)
                    success += 1
                    print(f"stored {len(rows)} days")
                except pymysql_err.DataError as e:
                    failed += 1
                    print(f"insert failed: {e}")
            except Exception as e:
                failed += 1
                print(f"error: {e}")
            time.sleep(0.1)

        deleted = cleanup_older_than_3_years(conn)
        print("\n" + "=" * 60)
        print("Summary")
        print("=" * 60)
        print(f"Updated: {success} symbols")
        print(f"Total new records: {total_new}")
        print(f"Failed: {failed} symbols")
        print(f"Cleaned up (older than 3 years): {deleted} rows")
        print("=" * 60)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
