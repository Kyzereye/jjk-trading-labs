#!/usr/bin/env python3
"""
Run the moving-average performance analysis against data already in MySQL.

This recreates the analysis-only path from the old TypeScript fetch-3year script:
- Reads historical prices from daily_stock_data
- Runs the MA/ATR/ADX signal engine for each symbol
- Stores performance metrics in stock_performance_metrics
- Stores recent trading signals in trading_signals

Run from get_stock_data directory:
  python src/scripts/analyze_3year_data.py
"""

import json
import math
import os
import sys
from datetime import date, datetime, timedelta

import dotenv
import pymysql
from pymysql.cursors import DictCursor

_script_dir = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(os.path.dirname(_script_dir))
dotenv.load_dotenv(os.path.join(_root, ".env"))


def _is_nan(v):
    try:
        return math.isnan(v)
    except Exception:
        return False


def _safe_float(v):
    if v is None:
        return float("nan")
    try:
        return float(v)
    except Exception:
        return float("nan")


def _date_key(d):
    if isinstance(d, datetime):
        return d.date().isoformat()
    if isinstance(d, date):
        return d.isoformat()
    return str(d)


def _to_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return datetime.fromisoformat(str(v)).date()


def get_connection():
    return pymysql.connect(
        host=os.environ.get("MYSQL_HOST", "localhost"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ.get("MYSQL_DATABASE", "StockPxLabs"),
        cursorclass=DictCursor,
    )


def get_all_symbols(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT symbol FROM stock_symbols ORDER BY symbol")
        return [row["symbol"] for row in cur.fetchall()]


def get_symbol_id(conn, symbol):
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


def get_stock_data(conn, symbol):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT d.date, d.open, d.high, d.low, d.close, d.volume
            FROM daily_stock_data d
            JOIN stock_symbols s ON s.id = d.symbol_id
            WHERE s.symbol = %s
            ORDER BY d.date ASC
            """,
            (symbol.upper(),),
        )
        rows = cur.fetchall()
        return [
            {
                "date": _to_date(row["date"]),
                "open": _safe_float(row["open"]),
                "high": _safe_float(row["high"]),
                "low": _safe_float(row["low"]),
                "close": _safe_float(row["close"]),
                "volume": float(row["volume"] or 0),
            }
            for row in rows
        ]


def store_performance_metrics(
    conn,
    symbol_id,
    analysis_date,
    time_period,
    strategy_mode,
    total_return_pct,
    total_pnl,
    win_rate,
    total_trades,
    sharpe_ratio,
    analysis_params,
):
    query = """
        INSERT INTO stock_performance_metrics
        (symbol_id, analysis_date, time_period, strategy_mode, total_return_pct, total_pnl, win_rate, total_trades, sharpe_ratio, analysis_params)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
        total_return_pct = VALUES(total_return_pct),
        total_pnl = VALUES(total_pnl),
        win_rate = VALUES(win_rate),
        total_trades = VALUES(total_trades),
        sharpe_ratio = VALUES(sharpe_ratio),
        analysis_params = VALUES(analysis_params),
        updated_at = CURRENT_TIMESTAMP
    """
    params = (
        symbol_id,
        analysis_date.isoformat(),
        time_period,
        strategy_mode,
        round(total_return_pct, 2),
        round(total_pnl, 2),
        round(win_rate, 1),
        total_trades,
        round(sharpe_ratio, 2),
        json.dumps(analysis_params),
    )
    with conn.cursor() as cur:
        cur.execute(query, params)
    conn.commit()


def store_recent_signals(conn, symbol, signals, mean_reversion_alerts):
    symbol_id = get_symbol_id(conn, symbol)
    fourteen_days_ago = date.today() - timedelta(days=14)

    all_signals = []
    for s in signals:
        signal_type = (
            "entry"
            if s["signal_type"] in ("BUY", "SELL_SHORT")
            else "exit"
            if s["signal_type"] in ("SELL", "BUY_TO_COVER")
            else None
        )
        if signal_type:
            all_signals.append(
                {
                    "date": s["date"],
                    "signalType": signal_type,
                    "direction": s.get("position_type") or "long",
                    "price": s["price"],
                    "ma21": s["ma_21"],
                    "ma50": s["ma_50"],
                    "deviation": None,
                }
            )

    for a in mean_reversion_alerts:
        all_signals.append(
            {
                "date": a["date"],
                "signalType": "mean_reversion",
                "direction": a.get("position_type") or "long",
                "price": a["price"],
                "ma21": a["ma_21"],
                "ma50": None,
                "deviation": a["deviation_from_ma21"],
            }
        )

    filtered = [s for s in all_signals if s["date"] >= fourteen_days_ago and s["signalType"]]
    if not filtered:
        return

    dedup = {}
    for sig in filtered:
        key = f"{_date_key(sig['date'])}_{sig['signalType']}_{sig['direction']}"
        dedup.setdefault(key, sig)

    values = []
    for sig in dedup.values():
        values.append(
            (
                symbol_id,
                sig["signalType"],
                sig["direction"],
                round(sig["price"], 2),
                round(sig["ma21"], 2) if sig["ma21"] is not None else None,
                round(sig["ma50"], 2) if sig["ma50"] is not None else None,
                round(sig["deviation"], 2) if sig["deviation"] is not None else None,
                sig["date"].isoformat(),
            )
        )

    query = """
        INSERT IGNORE INTO trading_signals
        (symbol_id, signal_type, signal_direction, price, ma21_value, ma50_value, deviation_percent, signal_date)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    with conn.cursor() as cur:
        cur.executemany(query, values)
    conn.commit()


def calculate_ema(data, period):
    result = [float("nan")] * len(data)
    if len(data) == 0:
        return result
    alpha = 2 / (period + 1)
    sum_ = 0.0
    for i in range(min(period, len(data))):
        sum_ += data[i]
    if period - 1 < len(result):
        result[period - 1] = sum_ / period
    for i in range(period, len(data)):
        prev = result[i - 1]
        result[i] = alpha * data[i] + (1 - alpha) * prev
    return result


def calculate_sma(data, period):
    result = [float("nan")] * len(data)
    for i in range(period - 1, len(data)):
        s = 0.0
        for j in range(period):
            s += data[i - j]
        result[i] = s / period
    return result


def calculate_ma(data, period, ma_type):
    if ma_type == "sma":
        return calculate_sma(data, period)
    return calculate_ema(data, period)


def calculate_atr(data, period):
    result = [float("nan")] * len(data)
    true_ranges = []
    for i in range(1, len(data)):
        tr1 = data[i]["high"] - data[i]["low"]
        tr2 = abs(data[i]["high"] - data[i - 1]["close"])
        tr3 = abs(data[i]["low"] - data[i - 1]["close"])
        true_ranges.append(max(tr1, tr2, tr3))
    atr_values = calculate_ema(true_ranges, period)
    for i, v in enumerate(atr_values):
        if i + 1 < len(result):
            result[i + 1] = v
    return result


def calculate_adx(data, period=14):
    result = [float("nan")] * len(data)
    if len(data) < period + 1:
        return result

    plus_dm = []
    minus_dm = []
    true_ranges = []
    for i in range(1, len(data)):
        high_diff = data[i]["high"] - data[i - 1]["high"]
        low_diff = data[i - 1]["low"] - data[i]["low"]
        plus_dm.append(high_diff > low_diff and high_diff > 0 and high_diff or 0)
        minus_dm.append(low_diff > high_diff and low_diff > 0 and low_diff or 0)
        tr1 = data[i]["high"] - data[i]["low"]
        tr2 = abs(data[i]["high"] - data[i - 1]["close"])
        tr3 = abs(data[i]["low"] - data[i - 1]["close"])
        true_ranges.append(max(tr1, tr2, tr3))

    smoothed_plus = calculate_ema(plus_dm, period)
    smoothed_minus = calculate_ema(minus_dm, period)
    smoothed_tr = calculate_ema(true_ranges, period)

    plus_di = []
    minus_di = []
    for i in range(len(smoothed_tr)):
        if not _is_nan(smoothed_tr[i]) and smoothed_tr[i] > 0:
            plus_di.append((smoothed_plus[i] / smoothed_tr[i]) * 100)
            minus_di.append((smoothed_minus[i] / smoothed_tr[i]) * 100)
        else:
            plus_di.append(float("nan"))
            minus_di.append(float("nan"))

    dx = []
    for i in range(len(plus_di)):
        if not _is_nan(plus_di[i]) and not _is_nan(minus_di[i]):
            di_sum = plus_di[i] + minus_di[i]
            if di_sum > 0:
                dx.append((abs(plus_di[i] - minus_di[i]) / di_sum) * 100)
            else:
                dx.append(0)
        else:
            dx.append(float("nan"))

    adx = calculate_ema(dx, period)
    for i, v in enumerate(adx):
        if i + 1 < len(result):
            result[i + 1] = v
    return result


def generate_long_signals(data, ma21, ma50, atr, adx, ma_type, atr_multiplier_long, mean_reversion_threshold, ma50_period, atr_period):
    signals = []
    in_trade = False
    current_trailing_stop = None
    highest_price_since_entry = None
    last_exit_date = None
    reentry_count = 0
    trend_start_date = None
    was_below_slow_ma = False
    start_index = max(ma50_period, atr_period)

    for i in range(start_index, len(data)):
        current_price = data[i]["close"]
        ma21_value = ma21[i]
        ma50_value = ma50[i]
        atr_value = atr[i]
        current_date = data[i]["date"]

        if _is_nan(ma21_value) or _is_nan(ma50_value) or _is_nan(atr_value):
            continue

        if i == start_index:
            if current_price < ma50_value:
                was_below_slow_ma = True
        elif not was_below_slow_ma and current_price < ma50_value:
            was_below_slow_ma = True

        if not was_below_slow_ma:
            continue

        is_new_trend = (
            (not in_trade)
            and current_price > ma50_value
            and i > 0
            and data[i - 1]["close"] <= ma50[i - 1]
        )
        can_reenter = (
            (not in_trade)
            and last_exit_date is not None
            and current_price > ma21_value
            and ma21_value > ma50_value
            and i > 0
            and data[i - 1]["close"] <= ma21[i - 1]
        )

        if in_trade:
            if highest_price_since_entry is None or current_price > highest_price_since_entry:
                highest_price_since_entry = current_price
                current_trailing_stop = highest_price_since_entry - (atr_value * atr_multiplier_long)

            sell_triggered = False
            sell_reason = ""
            if current_price < ma21_value and i > 0 and data[i - 1]["close"] >= ma21[i - 1]:
                sell_triggered = True
                sell_reason = f"Price {current_price:.2f} closed below 21 {ma_type.upper()} {ma21_value:.2f}"
            if (not sell_triggered) and current_trailing_stop is not None and current_price < current_trailing_stop:
                sell_triggered = True
                sell_reason = f"Price {current_price:.2f} hit trailing stop {current_trailing_stop:.2f}"
            if (not sell_triggered) and current_price < ma50_value:
                sell_triggered = True
                sell_reason = f"Major trend break: Price {current_price:.2f} closed below 50 {ma_type.upper()} {ma50_value:.2f}"

            if sell_triggered:
                confidence = min(0.9, abs(current_price - ma21_value) / ma21_value * 10)
                signals.append(
                    {
                        "date": current_date,
                        "signal_type": "SELL",
                        "price": current_price,
                        "ma_21": ma21_value,
                        "ma_50": ma50_value,
                        "reasoning": sell_reason,
                        "confidence": confidence,
                        "atr": atr_value,
                        "trailing_stop": current_trailing_stop,
                        "position_type": "long",
                    }
                )
                in_trade = False
                last_exit_date = current_date
                current_trailing_stop = None
                highest_price_since_entry = None

        if not in_trade:
            if is_new_trend:
                confidence = min(0.9, abs(current_price - ma50_value) / ma50_value * 10)
                current_trailing_stop = current_price - (atr_value * atr_multiplier_long)
                highest_price_since_entry = current_price
                trend_start_date = current_date
                reentry_count = 0
                signals.append(
                    {
                        "date": current_date,
                        "signal_type": "BUY",
                        "price": current_price,
                        "ma_21": ma21_value,
                        "ma_50": ma50_value,
                        "reasoning": f"Primary entry: Price {current_price:.2f} closed above 50 {ma_type.upper()} {ma50_value:.2f}",
                        "confidence": confidence,
                        "atr": atr_value,
                        "trailing_stop": current_trailing_stop,
                        "position_type": "long",
                    }
                )
                in_trade = True
            elif can_reenter:
                confidence = min(0.8, abs(current_price - ma21_value) / ma21_value * 10)
                current_trailing_stop = current_price - (atr_value * atr_multiplier_long)
                highest_price_since_entry = current_price
                reentry_count += 1
                signals.append(
                    {
                        "date": current_date,
                        "signal_type": "BUY",
                        "price": current_price,
                        "ma_21": ma21_value,
                        "ma_50": ma50_value,
                        "reasoning": f"Re-entry #{reentry_count}: Price {current_price:.2f} closed above 21 {ma_type.upper()} {ma21_value:.2f} (trend confirmed: 21 MA > 50 MA)",
                        "confidence": confidence,
                        "atr": atr_value,
                        "trailing_stop": current_trailing_stop,
                        "position_type": "long",
                    }
                )
                in_trade = True

    return signals


def generate_short_signals(data, ma21, ma50, atr, adx, ma_type, atr_multiplier_short, mean_reversion_threshold, ma50_period, atr_period):
    signals = []
    in_trade = False
    current_trailing_stop = None
    lowest_price_since_entry = None
    last_exit_date = None
    reentry_count = 0
    trend_start_date = None
    was_above_slow_ma = False
    start_index = max(ma50_period, atr_period)

    for i in range(start_index, len(data)):
        current_price = data[i]["close"]
        ma21_value = ma21[i]
        ma50_value = ma50[i]
        atr_value = atr[i]
        current_date = data[i]["date"]

        if _is_nan(ma21_value) or _is_nan(ma50_value) or _is_nan(atr_value):
            continue

        if i == start_index:
            if current_price > ma50_value:
                was_above_slow_ma = True
        elif not was_above_slow_ma and current_price > ma50_value:
            was_above_slow_ma = True

        if not was_above_slow_ma:
            continue

        is_new_downtrend = (
            (not in_trade)
            and current_price < ma50_value
            and i > 0
            and data[i - 1]["close"] >= ma50[i - 1]
        )
        can_reenter_short = (
            (not in_trade)
            and last_exit_date is not None
            and current_price < ma21_value
            and ma21_value < ma50_value
            and i > 0
            and data[i - 1]["close"] >= ma21[i - 1]
        )

        if in_trade:
            if lowest_price_since_entry is None or current_price < lowest_price_since_entry:
                lowest_price_since_entry = current_price
                current_trailing_stop = lowest_price_since_entry + (atr_value * atr_multiplier_short)

            cover_triggered = False
            cover_reason = ""
            if current_price > ma21_value and i > 0 and data[i - 1]["close"] <= ma21[i - 1]:
                cover_triggered = True
                cover_reason = f"Price {current_price:.2f} closed above 21 {ma_type.upper()} {ma21_value:.2f}"
            if (not cover_triggered) and current_trailing_stop is not None and current_price > current_trailing_stop:
                cover_triggered = True
                cover_reason = f"Price {current_price:.2f} hit trailing stop {current_trailing_stop:.2f}"
            if (not cover_triggered) and current_price > ma50_value:
                cover_triggered = True
                cover_reason = f"Major trend reversal: Price {current_price:.2f} closed above 50 {ma_type.upper()} {ma50_value:.2f}"

            if cover_triggered:
                confidence = min(0.9, abs(current_price - ma21_value) / ma21_value * 10)
                signals.append(
                    {
                        "date": current_date,
                        "signal_type": "BUY_TO_COVER",
                        "price": current_price,
                        "ma_21": ma21_value,
                        "ma_50": ma50_value,
                        "reasoning": cover_reason,
                        "confidence": confidence,
                        "atr": atr_value,
                        "trailing_stop": current_trailing_stop,
                        "position_type": "short",
                    }
                )
                in_trade = False
                last_exit_date = current_date
                current_trailing_stop = None
                lowest_price_since_entry = None

        if not in_trade:
            if is_new_downtrend:
                confidence = min(0.9, abs(current_price - ma50_value) / ma50_value * 10)
                current_trailing_stop = current_price + (atr_value * atr_multiplier_short)
                lowest_price_since_entry = current_price
                trend_start_date = current_date
                reentry_count = 0
                signals.append(
                    {
                        "date": current_date,
                        "signal_type": "SELL_SHORT",
                        "price": current_price,
                        "ma_21": ma21_value,
                        "ma_50": ma50_value,
                        "reasoning": f"Primary short entry: Price {current_price:.2f} closed below 50 {ma_type.upper()} {ma50_value:.2f}",
                        "confidence": confidence,
                        "atr": atr_value,
                        "trailing_stop": current_trailing_stop,
                        "position_type": "short",
                    }
                )
                in_trade = True
            elif can_reenter_short:
                confidence = min(0.8, abs(current_price - ma21_value) / ma21_value * 10)
                current_trailing_stop = current_price + (atr_value * atr_multiplier_short)
                lowest_price_since_entry = current_price
                reentry_count += 1
                signals.append(
                    {
                        "date": current_date,
                        "signal_type": "SELL_SHORT",
                        "price": current_price,
                        "ma_21": ma21_value,
                        "ma_50": ma50_value,
                        "reasoning": f"Short re-entry #{reentry_count}: Price {current_price:.2f} closed below 21 {ma_type.upper()} {ma21_value:.2f} (downtrend confirmed: 21 MA < 50 MA)",
                        "confidence": confidence,
                        "atr": atr_value,
                        "trailing_stop": current_trailing_stop,
                        "position_type": "short",
                    }
                )
                in_trade = True

    return signals


def execute_trades(data, signals, initial_capital, position_sizing_long, position_sizing_short):
    trades = []
    current_position = None
    available_capital = float(initial_capital)
    reentry_count = 0
    date_to_index = {_date_key(item["date"]): idx for idx, item in enumerate(data)}

    for signal in signals:
        signal_type = signal["signal_type"]
        if signal_type == "BUY" and current_position is None:
            signal_index = date_to_index.get(_date_key(signal["date"]))
            if signal_index is not None and signal_index + 1 < len(data):
                next_day_index = signal_index + 1
                next_day_open = data[next_day_index]["open"]
                next_day_date = data[next_day_index]["date"]
                is_reentry = "Re-entry" in signal["reasoning"]
                reentry_count = 0 if not is_reentry else reentry_count + 1
                position_capital = available_capital * (position_sizing_long / 100) * (0.5 if is_reentry else 1.0)
                shares = math.floor(position_capital / next_day_open) if next_day_open > 0 else 0
                if shares > 0:
                    current_position = {
                        "entry_date": next_day_date,
                        "entry_price": next_day_open,
                        "entry_signal": signal["reasoning"],
                        "shares": shares,
                        "position_type": "long",
                        "is_reentry": is_reentry,
                        "reentry_count": reentry_count,
                    }
                    available_capital -= shares * next_day_open

        elif signal_type == "SELL_SHORT" and current_position is None:
            signal_index = date_to_index.get(_date_key(signal["date"]))
            if signal_index is not None and signal_index + 1 < len(data):
                next_day_index = signal_index + 1
                next_day_open = data[next_day_index]["open"]
                next_day_date = data[next_day_index]["date"]
                is_reentry = "Re-entry" in signal["reasoning"]
                reentry_count = 0 if not is_reentry else reentry_count + 1
                position_capital = available_capital * (position_sizing_short / 100) * (0.5 if is_reentry else 1.0)
                shares = math.floor(position_capital / next_day_open) if next_day_open > 0 else 0
                if shares > 0:
                    current_position = {
                        "entry_date": next_day_date,
                        "entry_price": next_day_open,
                        "entry_signal": signal["reasoning"],
                        "shares": shares,
                        "position_type": "short",
                        "is_reentry": is_reentry,
                        "reentry_count": reentry_count,
                    }
                    available_capital += shares * next_day_open

        elif signal_type == "SELL" and current_position is not None and current_position["position_type"] == "long":
            signal_index = date_to_index.get(_date_key(signal["date"]))
            if signal_index is not None and signal_index + 1 < len(data):
                next_day_index = signal_index + 1
                next_day_open = data[next_day_index]["open"]
                next_day_date = data[next_day_index]["date"]
                shares = current_position["shares"]
                pnl = shares * (next_day_open - current_position["entry_price"])
                pnl_percent = ((next_day_open - current_position["entry_price"]) / current_position["entry_price"]) * 100
                duration = (next_day_date - current_position["entry_date"]).days
                exit_reason = "MA Signal"
                if "trailing stop" in signal["reasoning"].lower():
                    exit_reason = "Trailing Stop"
                elif "Major trend break" in signal["reasoning"]:
                    exit_reason = "Trend Break"
                trades.append(
                    {
                        "entry_date": current_position["entry_date"],
                        "exit_date": next_day_date,
                        "entry_price": current_position["entry_price"],
                        "exit_price": next_day_open,
                        "entry_signal": current_position["entry_signal"],
                        "exit_signal": signal["reasoning"],
                        "shares": shares,
                        "position_type": "long",
                        "pnl": pnl,
                        "pnl_percent": pnl_percent,
                        "duration_days": duration,
                        "exit_reason": exit_reason,
                        "is_reentry": current_position["is_reentry"],
                        "reentry_count": current_position["reentry_count"],
                    }
                )
                available_capital += shares * next_day_open
                current_position = None

        elif signal_type == "BUY_TO_COVER" and current_position is not None and current_position["position_type"] == "short":
            signal_index = date_to_index.get(_date_key(signal["date"]))
            if signal_index is not None and signal_index + 1 < len(data):
                next_day_index = signal_index + 1
                next_day_open = data[next_day_index]["open"]
                next_day_date = data[next_day_index]["date"]
                shares = current_position["shares"]
                pnl = shares * (current_position["entry_price"] - next_day_open)
                pnl_percent = ((current_position["entry_price"] - next_day_open) / current_position["entry_price"]) * 100
                duration = (next_day_date - current_position["entry_date"]).days
                exit_reason = "MA Signal"
                if "trailing stop" in signal["reasoning"].lower():
                    exit_reason = "Trailing Stop"
                elif "Major trend reversal" in signal["reasoning"]:
                    exit_reason = "Trend Reversal"
                trades.append(
                    {
                        "entry_date": current_position["entry_date"],
                        "exit_date": next_day_date,
                        "entry_price": current_position["entry_price"],
                        "exit_price": next_day_open,
                        "entry_signal": current_position["entry_signal"],
                        "exit_signal": signal["reasoning"],
                        "shares": shares,
                        "position_type": "short",
                        "pnl": pnl,
                        "pnl_percent": pnl_percent,
                        "duration_days": duration,
                        "exit_reason": exit_reason,
                        "is_reentry": current_position["is_reentry"],
                        "reentry_count": current_position["reentry_count"],
                    }
                )
                available_capital -= shares * next_day_open
                current_position = None

    if current_position is not None:
        final_price = data[-1]["close"]
        final_date = data[-1]["date"]
        shares = current_position["shares"]
        if current_position["position_type"] == "long":
            pnl = shares * (final_price - current_position["entry_price"])
            pnl_percent = ((final_price - current_position["entry_price"]) / current_position["entry_price"]) * 100
        else:
            pnl = shares * (current_position["entry_price"] - final_price)
            pnl_percent = ((current_position["entry_price"] - final_price) / current_position["entry_price"]) * 100
        duration = (final_date - current_position["entry_date"]).days
        trades.append(
            {
                "entry_date": current_position["entry_date"],
                "exit_date": final_date,
                "entry_price": current_position["entry_price"],
                "exit_price": final_price,
                "entry_signal": current_position["entry_signal"],
                "exit_signal": "End of period - position closed",
                "shares": shares,
                "position_type": current_position["position_type"],
                "pnl": pnl,
                "pnl_percent": pnl_percent,
                "duration_days": duration,
                "is_reentry": current_position["is_reentry"],
                "reentry_count": current_position["reentry_count"],
            }
        )

    calculate_running_metrics(trades, initial_capital)
    return trades


def calculate_running_metrics(trades, initial_capital):
    running_pnl = 0.0
    running_capital = float(initial_capital)
    peak_capital = float(initial_capital)
    for trade in trades:
        if trade.get("pnl") is not None:
            trade_pnl = float(trade["pnl"])
            running_pnl += trade_pnl
            running_capital += trade_pnl
            if running_capital > peak_capital:
                peak_capital = running_capital
            drawdown = ((running_capital - peak_capital) / peak_capital) * 100
            trade["running_pnl"] = round(running_pnl, 2)
            trade["running_capital"] = round(running_capital, 2)
            trade["drawdown"] = round(drawdown, 2)


def generate_mean_reversion_alerts(data, ma21, trades, mean_reversion_threshold):
    alerts = []
    trade_dates = set()
    for trade in trades:
        if trade.get("entry_date") and trade.get("exit_date"):
            current = trade["entry_date"]
            end = trade["exit_date"]
            while current <= end:
                trade_dates.add(current.isoformat())
                current = current.fromordinal(current.toordinal() + 1)

    alert_triggered = False
    peak_distance = 0
    for i in range(len(data)):
        if _is_nan(ma21[i]):
            continue
        date_str = data[i]["date"].isoformat()
        if date_str not in trade_dates:
            alert_triggered = False
            peak_distance = 0
            continue
        current_price = data[i]["close"]
        ma21_value = ma21[i]
        distance_percent = abs(current_price - ma21_value) / ma21_value * 100
        if current_price > ma21_value and distance_percent >= mean_reversion_threshold:
            if not alert_triggered:
                alerts.append(
                    {
                        "date": data[i]["date"],
                        "price": current_price,
                        "ma_21": ma21_value,
                        "distance_percent": distance_percent,
                        "reasoning": f"Price {distance_percent:.1f}% above 21-MA during trade - potential mean reversion (overbought)",
                    }
                )
                alert_triggered = True
                peak_distance = distance_percent
            else:
                if distance_percent > peak_distance:
                    peak_distance = distance_percent
        else:
            if alert_triggered and distance_percent < (peak_distance * 0.5):
                alert_triggered = False
                peak_distance = 0
    return alerts


def calculate_performance_metrics(trades, initial_capital):
    if not trades:
        return {
            "total_trades": 0,
            "winning_trades": 0,
            "losing_trades": 0,
            "win_rate": 0.0,
            "total_pnl": 0.0,
            "total_return_percent": 0.0,
            "avg_trade_duration": 0,
            "max_drawdown": 0.0,
            "sharpe_ratio": 0.0,
        }

    total_trades = len(trades)
    winning_trades = sum(1 for t in trades if (t.get("pnl") or 0) > 0)
    losing_trades = sum(1 for t in trades if (t.get("pnl") or 0) < 0)
    win_rate = (winning_trades / total_trades) * 100
    total_pnl = sum((t.get("pnl") or 0) for t in trades)
    total_return_percent = (total_pnl / initial_capital) * 100
    avg_duration = sum((t.get("duration_days") or 0) for t in trades) / total_trades

    cumulative_pnl = 0
    peak = 0
    max_drawdown = 0
    for trade in trades:
        if trade.get("pnl") is not None:
            cumulative_pnl += trade["pnl"]
            if cumulative_pnl > peak:
                peak = cumulative_pnl
            drawdown = peak - cumulative_pnl
            if drawdown > max_drawdown:
                max_drawdown = drawdown

    return {
        "total_trades": total_trades,
        "winning_trades": winning_trades,
        "losing_trades": losing_trades,
        "win_rate": win_rate,
        "total_pnl": total_pnl,
        "total_return_percent": total_return_percent,
        "avg_trade_duration": avg_duration,
        "max_drawdown": max_drawdown,
        "sharpe_ratio": calculate_sharpe_ratio(trades),
    }


def calculate_sharpe_ratio(trades):
    if len(trades) < 2:
        return 0.0
    returns = []
    for trade in trades:
        if trade.get("pnl") is not None and trade["entry_price"] > 0:
            trade_return = (trade["pnl"] / (trade["entry_price"] * trade["shares"])) * 100
            returns.append(trade_return)
    if len(returns) < 2:
        return 0.0
    mean_return = sum(returns) / len(returns)
    variance = sum((r - mean_return) ** 2 for r in returns) / (len(returns) - 1)
    std_dev = math.sqrt(variance)
    if std_dev == 0:
        return 0.0
    return round(mean_return / std_dev, 2)


class MATradingEngine:
    def __init__(
        self,
        initial_capital=100000,
        atr_period=14,
        atr_multiplier_long=2.0,
        atr_multiplier_short=1.5,
        ma_type="ema",
        custom_fast_ma=None,
        custom_slow_ma=None,
        mean_reversion_threshold=10.0,
        position_sizing_long=5.0,
        position_sizing_short=3.0,
        strategy_mode="long",
    ):
        self.initial_capital = initial_capital
        self.atr_period = atr_period
        self.atr_multiplier_long = atr_multiplier_long
        self.atr_multiplier_short = atr_multiplier_short
        self.ma_type = ma_type.lower()
        self.mean_reversion_threshold = mean_reversion_threshold
        self.position_sizing_long = position_sizing_long
        self.position_sizing_short = position_sizing_short
        self.strategy_mode = strategy_mode
        if custom_fast_ma and custom_slow_ma:
            self.ma21_period = custom_fast_ma
            self.ma50_period = custom_slow_ma
        else:
            self.ma21_period = 21
            self.ma50_period = 50

    def run_analysis(self, data, symbol):
        if len(data) < self.ma50_period:
            raise ValueError(
                f"Not enough data for {self.ma_type.upper()} analysis. Need at least {self.ma50_period} days"
            )
        close_prices = [d["close"] for d in data]
        ma21 = calculate_ma(close_prices, self.ma21_period, self.ma_type)
        ma50 = calculate_ma(close_prices, self.ma50_period, self.ma_type)
        atr = calculate_atr(data, self.atr_period)
        adx = calculate_adx(data, 14)
        if self.strategy_mode == "long":
            signals = generate_long_signals(
                data, ma21, ma50, atr, adx, self.ma_type, self.atr_multiplier_long, self.mean_reversion_threshold, self.ma50_period, self.atr_period
            )
        elif self.strategy_mode == "short":
            signals = generate_short_signals(
                data, ma21, ma50, atr, adx, self.ma_type, self.atr_multiplier_short, self.mean_reversion_threshold, self.ma50_period, self.atr_period
            )
        else:
            long_signals = generate_long_signals(
                data, ma21, ma50, atr, adx, self.ma_type, self.atr_multiplier_long, self.mean_reversion_threshold, self.ma50_period, self.atr_period
            )
            short_signals = generate_short_signals(
                data, ma21, ma50, atr, adx, self.ma_type, self.atr_multiplier_short, self.mean_reversion_threshold, self.ma50_period, self.atr_period
            )
            signals = sorted(long_signals + short_signals, key=lambda x: x["date"])

        trades = execute_trades(data, signals, self.initial_capital, self.position_sizing_long, self.position_sizing_short)
        mean_reversion_alerts = generate_mean_reversion_alerts(data, ma21, trades, self.mean_reversion_threshold)
        performance_metrics = calculate_performance_metrics(trades, self.initial_capital)
        equity_curve = generate_equity_curve(data, trades, self.initial_capital)
        trades.sort(key=lambda x: x["entry_date"], reverse=True)
        signals.sort(key=lambda x: x["date"], reverse=True)
        mean_reversion_alerts.sort(key=lambda x: x["date"], reverse=True)
        return {
            "symbol": symbol,
            "start_date": data[0]["date"],
            "end_date": data[-1]["date"],
            "total_days": len(data),
            "trades": trades,
            "signals": signals,
            "mean_reversion_alerts": mean_reversion_alerts,
            "performance_metrics": performance_metrics,
            "equity_curve": equity_curve,
        }


def generate_equity_curve(data, trades, initial_capital):
    equity_curve = []
    current_equity = float(initial_capital)
    trade_pnl_by_date = {}
    for trade in trades:
        if trade.get("exit_date") and trade.get("pnl") is not None:
            trade_pnl_by_date[trade["exit_date"].isoformat()] = trade["pnl"]
    for item in data:
        date_str = item["date"].isoformat()
        if date_str in trade_pnl_by_date:
            current_equity += trade_pnl_by_date[date_str]
        equity_curve.append((item["date"], current_equity))
    return equity_curve


class PerformanceAnalyzer:
    def __init__(self):
        self.db = get_connection()

    def close(self):
        self.db.close()

    def analyze_and_store_performance(self, symbol, stock_data, analysis_params, time_period="ALL", analysis_date=None):
        try:
            if analysis_date is None:
                analysis_date = date.today()
            if not stock_data or len(stock_data) < 30:
                return False, f"Insufficient data: {len(stock_data) if stock_data else 0} days (need at least 30)"

            data_to_analyze = stock_data
            if analysis_params.get("days") and analysis_params["days"] > 0:
                data_to_analyze = stock_data[-analysis_params["days"] :]
                if len(data_to_analyze) < 60:
                    return False, f"Insufficient data after slicing: {len(data_to_analyze)} days (need at least 60 for MA calculations)"

            initial_capital = analysis_params.get("initial_capital", 100000)
            atr_period = analysis_params.get("atr_period", 14)
            atr_multiplier = analysis_params.get("atr_multiplier", 2.0)
            atr_multiplier_long = analysis_params.get("atr_multiplier_long", atr_multiplier or 2.0)
            atr_multiplier_short = analysis_params.get("atr_multiplier_short", 1.5)
            ma_type = analysis_params.get("ma_type", "ema")
            position_sizing_percentage = analysis_params.get("position_sizing_percentage", 5.0)
            position_sizing_long = analysis_params.get("position_sizing_long", position_sizing_percentage or 5.0)
            position_sizing_short = analysis_params.get("position_sizing_short", 3.0)
            mean_reversion_threshold = analysis_params.get("mean_reversion_threshold", 10.0)
            custom_fast_ma = analysis_params.get("custom_fast_ma")
            custom_slow_ma = analysis_params.get("custom_slow_ma")
            strategy_mode = analysis_params.get("strategy_mode", "long")

            engine = MATradingEngine(
                initial_capital,
                atr_period,
                atr_multiplier_long,
                atr_multiplier_short,
                ma_type,
                custom_fast_ma or None,
                custom_slow_ma or None,
                mean_reversion_threshold,
                position_sizing_long,
                position_sizing_short,
                strategy_mode,
            )

            results = engine.run_analysis(data_to_analyze, symbol)
            self.store_recent_signals(symbol, results["signals"], results["mean_reversion_alerts"])

            total_trades = len(results["trades"])
            if total_trades == 0:
                return False, "No trades generated (flat/low volatility stock - no MA crossover signals)"
            if total_trades < 3:
                return False, f"Only {total_trades} trade(s) generated (insufficient activity for meaningful analysis)"

            winning_trades = sum(1 for t in results["trades"] if (t.get("pnl") or 0) > 0)
            win_rate = (winning_trades / total_trades) * 100 if total_trades > 0 else 0
            total_pnl = results["performance_metrics"]["total_pnl"]
            sharpe_ratio = results["performance_metrics"]["sharpe_ratio"]
            total_return_pct = (total_pnl / initial_capital) * 100

            symbol_id = get_symbol_id(self.db, symbol)
            self.store_performance_metrics(
                symbol_id,
                analysis_date,
                time_period,
                strategy_mode,
                total_return_pct,
                total_pnl,
                win_rate,
                total_trades,
                sharpe_ratio,
                analysis_params,
            )
            return True, None
        except Exception as e:
            return False, str(e)

    def store_performance_metrics(self, *args, **kwargs):
        return store_performance_metrics(self.db, *args, **kwargs)

    def store_recent_signals(self, *args, **kwargs):
        return store_recent_signals(self.db, *args, **kwargs)


TIME_PERIODS = [
    {
        "label": "ALL",
        "days": 0,
        "params": {
            "initial_capital": 100000,
            "atr_period": 14,
            "atr_multiplier_long": 2.0,
            "atr_multiplier_short": 1.5,
            "ma_type": "ema",
            "position_sizing_long": 5.0,
            "position_sizing_short": 3.0,
            "days": 0,
            "mean_reversion_threshold": 10.0,
        },
    },
    {
        "label": "1Y",
        "days": 365,
        "params": {
            "initial_capital": 100000,
            "atr_period": 14,
            "atr_multiplier_long": 2.0,
            "atr_multiplier_short": 1.5,
            "ma_type": "ema",
            "position_sizing_long": 5.0,
            "position_sizing_short": 3.0,
            "days": 365,
            "mean_reversion_threshold": 10.0,
        },
    },
]
STRATEGY_MODES = ["long", "short", "both"]


def main():
    symbol_filter = sys.argv[1].upper() if len(sys.argv) > 1 else None
    if symbol_filter:
        print(f"🚀 Starting analysis-only mode for {symbol_filter} (Python port of TS analyzer)...")
    else:
        print("🚀 Starting analysis-only mode (Python port of TS analyzer)...")
    db = get_connection()
    analyzer = PerformanceAnalyzer()
    try:
        analysis_date = date.today()
        print("📊 Loading symbols from database...")
        symbols = get_all_symbols(db)
        if not symbols:
            print("❌ No symbols found in database!")
            print("Please run the SQL script to populate stock_symbols table first.")
            raise SystemExit(1)

        if symbol_filter:
            symbols = [s for s in symbols if s.upper() == symbol_filter]
            if not symbols:
                print(f"❌ Symbol {symbol_filter} not found in stock_symbols.")
                raise SystemExit(1)

        print(f"✅ Found {len(symbols)} symbols to process\n")
        analysis_success_count = 0
        analysis_error_count = 0
        failed_symbols = []
        total_processed = 0

        for i, symbol in enumerate(symbols, 1):
            print(f"[{i}/{len(symbols)}] Processing {symbol}...")
            stock_data = get_stock_data(db, symbol)
            if not stock_data:
                analysis_error_count += 1
                failed_symbols.append({"symbol": symbol, "successful": 0, "total": len(TIME_PERIODS) * len(STRATEGY_MODES), "errors": ["No data in database"]})
                print("  ⚠️  No data in database")
                continue

            print("  🔬 Running MA trading analysis for ALL periods & strategies...")
            period_success_count = 0
            total_analyses = len(TIME_PERIODS) * len(STRATEGY_MODES)
            analysis_errors = []

            for period in TIME_PERIODS:
                for strategy_mode in STRATEGY_MODES:
                    analysis_params = dict(period["params"])
                    analysis_params["strategy_mode"] = strategy_mode
                    success, error = analyzer.analyze_and_store_performance(
                        symbol, stock_data, analysis_params, period["label"], analysis_date
                    )
                    if success:
                        period_success_count += 1
                    elif error:
                        analysis_errors.append(f"{period['label']}-{strategy_mode.upper()}: {error}")

            if period_success_count == total_analyses:
                analysis_success_count += 1
            elif period_success_count == 0:
                analysis_error_count += 1
                failed_symbols.append(
                    {
                        "symbol": symbol,
                        "successful": 0,
                        "total": total_analyses,
                        "errors": analysis_errors,
                    }
                )
                print(f"  ⚠️  Analysis failed for all {total_analyses} configurations")
            else:
                analysis_success_count += 1
                failed_symbols.append(
                    {
                        "symbol": symbol,
                        "successful": period_success_count,
                        "total": total_analyses,
                        "errors": analysis_errors,
                    }
                )
                print(f"  ⚠️  Analysis partially successful: {period_success_count}/{total_analyses} configurations passed")
            total_processed += 1

        print(f"\n{'=' * 70}")
        print("📊 FINAL SUMMARY")
        print(f"{'=' * 70}")
        print(f"✅ Symbols analyzed successfully: {analysis_success_count}")
        print(f"❌ Symbols with analysis failure: {analysis_error_count}")

        if failed_symbols:
            print("\n⚠️  Analysis Failed/Partial Symbols:")
            for item in failed_symbols:
                if item["successful"] == 0:
                    print(f"   • {item['symbol']}: 0/{item['total']} analyses succeeded (TOTAL FAILURE)")
                else:
                    print(f"   • {item['symbol']}: {item['successful']}/{item['total']} analyses succeeded (PARTIAL)")
                unique_errors = []
                for err in item["errors"]:
                    err_msg = err.split(": ", 1)[1] if ": " in err else err
                    if err_msg not in unique_errors:
                        unique_errors.append(err_msg)
                for err_msg in unique_errors:
                    print(f"     └─ {err_msg}")

        print("\n💾 Performance metrics stored in MySQL database")
        print("📈 Top performers data ready for querying!")
        print(f"{'=' * 70}\n")
    finally:
        analyzer.close()
        db.close()


if __name__ == "__main__":
    main()
