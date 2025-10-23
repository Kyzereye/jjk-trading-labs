/**
 * EMA Trading Controller
 * Handles Moving Average trading analysis endpoints
 */

import { Router, Request, Response } from 'express';
import { MATradingEngine, StockData } from '../services/trading-engine.service';
import { getStockData } from '../utils/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { asyncHandler, createError } from '../middleware/error.middleware';

const router = Router();

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    email_verified: boolean;
    role: string;
  };
}

/**
 * Analyze EMA trading for a specific symbol via POST request
 */
router.post('/analyze', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    symbol,
    initial_capital = 100000,
    days = 0,
    custom_fast_ma,
    custom_slow_ma,
    atr_period = 14,
    atr_multiplier = 2.0,
    mean_reversion_threshold = 10.0,
    position_sizing_percentage = 5.0,
    ma_type = 'ema',
    strategy_mode = 'long'
  } = req.body;

  // Ensure days is a number
  const daysNum = typeof days === 'string' ? parseInt(days, 10) : Number(days);

  if (!symbol) {
    throw createError('Symbol is required', 400);
  }

  // Get stock data
  const stockData = await getStockData(symbol.toUpperCase(), daysNum);
  if (!stockData) {
    throw createError(
      `Data not available for ${symbol.toUpperCase()}. This symbol may not be in our database yet. Please check the symbol or contact support to request this stock be added.`,
      404
    );
  }
  
  // Check for minimum data requirements
  if (stockData.length < 60) {
    throw createError(
      `Insufficient data for ${symbol.toUpperCase()}. Only ${stockData.length} days available. Need at least 60 days of historical data for MA analysis. This stock may be too new or have limited trading history.`,
      400
    );
  }

  // Convert to StockData format
  const data: StockData[] = stockData.map(item => ({
    date: new Date(item.date),
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume
  }));

  // Run MA analysis
  const engine = new MATradingEngine(
    initial_capital,
    atr_period,
    atr_multiplier, // atr_multiplier_long
    atr_multiplier * 0.75, // atr_multiplier_short (tighter)
    ma_type,
    custom_fast_ma,
    custom_slow_ma,
    mean_reversion_threshold,
    position_sizing_percentage, // position_sizing_long
    position_sizing_percentage * 0.6, // position_sizing_short (smaller)
    strategy_mode as 'long' | 'short' | 'both'
  );

  const results = await engine.runAnalysis(data, symbol.toUpperCase());
  
  // Check if any trades were generated
  if (!results.trades || results.trades.length === 0) {
    throw createError(
      `No trading signals generated for ${symbol.toUpperCase()}. This stock shows flat/low volatility price action with no MA crossover signals. The MA strategy may not be suitable for this stock. Try a stock with more price movement.`,
      400
    );
  }
  
  // Check for meaningful analysis (at least 3 trades)
  if (results.trades.length < 3) {
    throw createError(
      `Insufficient trading activity for ${symbol.toUpperCase()}. Only ${results.trades.length} trade(s) generated. Need at least 3 trades for meaningful analysis. This stock may have very low volatility or limited price movement.`,
      400
    );
  }

  // Convert results to JSON-serializable format
  const response = {
    symbol: results.symbol,
    start_date: results.start_date.toISOString(),
    end_date: results.end_date.toISOString(),
    total_days: results.total_days,
    performance_metrics: results.performance_metrics,
    trades: results.trades.map(trade => ({
      entry_date: trade.entry_date.toISOString(),
      exit_date: trade.exit_date?.toISOString() || null,
      entry_price: trade.entry_price,
      exit_price: trade.exit_price || null,
      entry_signal: trade.entry_signal,
      exit_signal: trade.exit_signal,
      shares: trade.shares,
      pnl: trade.pnl || null,
      pnl_percent: trade.pnl_percent || null,
      duration_days: trade.duration_days || null,
      exit_reason: trade.exit_reason || null,
      is_reentry: trade.is_reentry,
      reentry_count: trade.reentry_count,
      running_pnl: trade.running_pnl || null,
      running_capital: trade.running_capital || null,
      drawdown: trade.drawdown || null
    })),
    signals: results.signals.map(signal => ({
      date: signal.date.toISOString(),
      signal_type: signal.signal_type,
      price: signal.price,
      ma_21: signal.ma_21,
      ma_50: signal.ma_50,
      reasoning: signal.reasoning,
      confidence: signal.confidence,
      atr: signal.atr || null,
      trailing_stop: signal.trailing_stop || null
    })),
    mean_reversion_alerts: results.mean_reversion_alerts.map(alert => ({
      date: alert.date.toISOString(),
      price: alert.price,
      ma_21: alert.ma_21,
      distance_percent: alert.distance_percent,
      reasoning: alert.reasoning
    })),
    equity_curve: results.equity_curve.map(([date, equity]) => ({
      date: date.toISOString(),
      equity
    }))
  };

  res.json(response);
}));

/**
 * Analyze EMA trading for a specific symbol via GET request
 */
router.get('/analyze/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const initial_capital = parseFloat(req.query.initial_capital as string) || 100000;
  const days = parseInt(req.query.days as string) || 365;
  const atr_period = parseInt(req.query.atr_period as string) || 14;
  const atr_multiplier = parseFloat(req.query.atr_multiplier as string) || 2.0;
  const ma_type = (req.query.ma_type as string) || 'ema';

  // Get stock data
  const stockData = await getStockData(symbol.toUpperCase(), days);
  if (!stockData) {
    throw createError(`No data found for symbol ${symbol}`, 404);
  }

  // Convert to StockData format
  const data: StockData[] = stockData.map(item => ({
    date: new Date(item.date),
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume
  }));

  // Run MA analysis
  const engine = new MATradingEngine(
    initial_capital,
    atr_period,
    atr_multiplier, // atr_multiplier_long
    atr_multiplier * 0.75, // atr_multiplier_short
    ma_type,
    undefined,
    undefined,
    10.0, // mean_reversion_threshold
    5.0, // position_sizing_long
    3.0, // position_sizing_short
    'long' // strategy_mode
  );
  const results = await engine.runAnalysis(data, symbol.toUpperCase());

  // Convert results to JSON-serializable format
  const response = {
    symbol: results.symbol,
    start_date: results.start_date.toISOString(),
    end_date: results.end_date.toISOString(),
    total_days: results.total_days,
    performance_metrics: results.performance_metrics,
    trades: results.trades.map(trade => ({
      entry_date: trade.entry_date.toISOString(),
      exit_date: trade.exit_date?.toISOString() || null,
      entry_price: trade.entry_price,
      exit_price: trade.exit_price || null,
      entry_signal: trade.entry_signal,
      exit_signal: trade.exit_signal,
      shares: trade.shares,
      pnl: trade.pnl || null,
      pnl_percent: trade.pnl_percent || null,
      duration_days: trade.duration_days || null,
      exit_reason: trade.exit_reason || null,
      is_reentry: trade.is_reentry,
      reentry_count: trade.reentry_count,
      running_pnl: trade.running_pnl || null,
      running_capital: trade.running_capital || null,
      drawdown: trade.drawdown || null
    })),
    signals: results.signals.map(signal => ({
      date: signal.date.toISOString(),
      signal_type: signal.signal_type,
      price: signal.price,
      ma_21: signal.ma_21,
      ma_50: signal.ma_50,
      reasoning: signal.reasoning,
      confidence: signal.confidence,
      atr: signal.atr || null,
      trailing_stop: signal.trailing_stop || null
    })),
    equity_curve: results.equity_curve.map(([date, equity]) => ({
      date: date.toISOString(),
      equity
    }))
  };

  res.json(response);
}));

/**
 * Get EMA trading signals for a specific symbol
 */
router.get('/signals/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const days = parseInt(req.query.days as string) || 100;

  // Get stock data
  const stockData = await getStockData(symbol.toUpperCase(), days);
  if (!stockData) {
    throw createError(`No data found for symbol ${symbol}`, 404);
  }

  // Convert to StockData format
  const data: StockData[] = stockData.map(item => ({
    date: new Date(item.date),
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume
  }));

  // Run MA analysis
  const engine = new MATradingEngine(
    100000, // initial_capital
    14, // atr_period
    2.0, // atr_multiplier_long
    1.5, // atr_multiplier_short
    'ema', // ma_type
    undefined, // custom_fast_ma
    undefined, // custom_slow_ma
    7.0, // mean_reversion_threshold
    5.0, // position_sizing_long
    3.0, // position_sizing_short
    'long' // strategy_mode
  );
  const results = await engine.runAnalysis(data, symbol.toUpperCase());

  // Return only signals
  const response = {
    symbol: results.symbol,
    signals: results.signals.map(signal => ({
      date: signal.date.toISOString(),
      signal_type: signal.signal_type,
      price: signal.price,
      ma_21: signal.ma_21,
      ma_50: signal.ma_50,
      reasoning: signal.reasoning,
      confidence: signal.confidence,
      atr: signal.atr || null,
      trailing_stop: signal.trailing_stop || null
    })),
    mean_reversion_alerts: results.mean_reversion_alerts.map(alert => ({
      date: alert.date.toISOString(),
      price: alert.price,
      ma_21: alert.ma_21,
      distance_percent: alert.distance_percent,
      reasoning: alert.reasoning
    }))
  };

  res.json(response);
}));

/**
 * Get EMA trading summary for a specific symbol
 */
router.get('/summary/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const initial_capital = parseFloat(req.query.initial_capital as string) || 100000;
  const days = parseInt(req.query.days as string) || 365;

  // Get stock data
  const stockData = await getStockData(symbol.toUpperCase(), days);
  if (!stockData) {
    throw createError(`No data found for symbol ${symbol}`, 404);
  }

  // Convert to StockData format
  const data: StockData[] = stockData.map(item => ({
    date: new Date(item.date),
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume
  }));

  // Run MA analysis
  const engine = new MATradingEngine(
    initial_capital,
    14, // atr_period
    2.0, // atr_multiplier_long
    1.5, // atr_multiplier_short
    'ema',
    undefined,
    undefined,
    7.0, // mean_reversion_threshold
    5.0, // position_sizing_long
    3.0, // position_sizing_short
    'long' // strategy_mode
  );
  const results = await engine.runAnalysis(data, symbol.toUpperCase());

  // Return summary
  const response = {
    symbol: results.symbol,
    period: `${results.start_date.toISOString().split('T')[0]} to ${results.end_date.toISOString().split('T')[0]}`,
    total_days: results.total_days,
    performance_metrics: results.performance_metrics,
    recent_signals: results.signals.slice(-5).map(signal => ({
      date: signal.date.toISOString(),
      signal_type: signal.signal_type,
      price: signal.price,
      reasoning: signal.reasoning
    })),
    recent_mean_reversion_alerts: results.mean_reversion_alerts.slice(-5).map(alert => ({
      date: alert.date.toISOString(),
      price: alert.price,
      distance_percent: alert.distance_percent,
      reasoning: alert.reasoning
    }))
  };

  res.json(response);
}));

/**
 * Get top performing stocks from pre-computed database results
 */
router.post('/top-performers', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    limit = 20,
    sort_by = 'total_return_pct',
    min_trades = 5,
    time_period = 'ALL',
    strategy_mode = 'long'
  } = req.body;

  // Ensure limit is a valid number
  const limitNum = Math.min(Math.max(parseInt(String(limit)), 1), 5000);
  const minTradesNum = Math.max(parseInt(String(min_trades)), 0);

  // Validate sort_by
  const validSortFields = ['total_return_pct', 'sharpe_ratio', 'win_rate'];
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'total_return_pct';
  
  // Validate time_period
  const validTimePeriods = ['ALL', '1Y'];
  const timePeriod = validTimePeriods.includes(time_period) ? time_period : 'ALL';
  
  // Validate strategy_mode
  const validStrategyModes = ['long', 'short', 'both'];
  const strategyMode = validStrategyModes.includes(strategy_mode) ? strategy_mode : 'long';

  // Build query with safe ORDER BY and LIMIT (using interpolation for LIMIT is safe with validated number)
  let query = `
    SELECT 
      s.symbol,
      s.company_name,
      p.total_return_pct,
      p.total_pnl,
      p.win_rate,
      p.total_trades,
      p.sharpe_ratio,
      p.analysis_date,
      p.analysis_params
    FROM stock_performance_metrics p
    JOIN stock_symbols s ON p.symbol_id = s.id
    WHERE p.total_trades >= ?
      AND p.time_period = ?
      AND p.strategy_mode = ?
      AND p.analysis_date = (SELECT MAX(analysis_date) FROM stock_performance_metrics WHERE time_period = ? AND strategy_mode = ?)
  `;
  
  // Add ORDER BY based on validated field
  if (sortField === 'sharpe_ratio') {
    query += ' ORDER BY p.sharpe_ratio DESC';
  } else if (sortField === 'win_rate') {
    query += ' ORDER BY p.win_rate DESC';
  } else {
    query += ' ORDER BY p.total_return_pct DESC';
  }
  
  // Add LIMIT using string interpolation (safe because limitNum is validated as integer)
  query += ` LIMIT ${limitNum}`;

  const { getDbConnection } = await import('../utils/database');
  const db = getDbConnection();
  
  const [rows] = await db.execute(query, [minTradesNum, timePeriod, strategyMode, timePeriod, strategyMode]);
  
  const topPerformers = (rows as any[]).map(row => ({
    symbol: row.symbol,
    company_name: row.company_name,
    total_return_pct: parseFloat(row.total_return_pct || 0),
    total_pnl: parseFloat(row.total_pnl || 0),
    win_rate: parseFloat(row.win_rate || 0),
    total_trades: parseInt(row.total_trades || 0),
    sharpe_ratio: parseFloat(row.sharpe_ratio || 0),
    analysis_date: row.analysis_date
  }));

  // Get total analyzed count for this time period and strategy
  const [countRows] = await db.execute(
    'SELECT COUNT(*) as count FROM stock_performance_metrics WHERE time_period = ? AND strategy_mode = ? AND analysis_date = (SELECT MAX(analysis_date) FROM stock_performance_metrics WHERE time_period = ? AND strategy_mode = ?)',
    [timePeriod, strategyMode, timePeriod, strategyMode]
  );
  const totalAnalyzed = (countRows as any[])[0]?.count || 0;

  // Get latest analysis date for this time period and strategy
  const [dateRows] = await db.execute(
    'SELECT MAX(analysis_date) as latest FROM stock_performance_metrics WHERE time_period = ? AND strategy_mode = ?',
    [timePeriod, strategyMode]
  );
  const latestAnalysisDate = (dateRows as any[])[0]?.latest || null;

  res.json({
    success: true,
    top_performers: topPerformers,
    total_analyzed: totalAnalyzed,
    latest_analysis_date: latestAnalysisDate,
    sort_by: sortField,
    limit
  });
}));

/**
 * Get analysis statistics
 */
router.get('/analysis-stats', asyncHandler(async (req: Request, res: Response) => {
  // For now, return basic stats
  // In a full implementation, this would query the database for actual stats
  const stats = {
    total_analyses: 0,
    total_symbols: 0,
    last_updated: new Date().toISOString()
  };

  res.json({
    success: true,
    stats
  });
}));

export default router;
