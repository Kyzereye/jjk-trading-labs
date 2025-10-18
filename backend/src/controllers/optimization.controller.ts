/**
 * Optimization Controller
 * Handles Moving Average pair optimization endpoints
 */

import { Router, Request, Response } from 'express';
import { MATradingEngine, StockData } from '../services/trading-engine.service';
import { getStockData } from '../utils/database';
import { asyncHandler, createError } from '../middleware/error.middleware';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

export interface MAOptimizationResult {
  fast_ma: number;
  slow_ma: number;
  ma_distance: number;
  total_return_percent: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  avg_trade_duration: number;
  symbol: string;
  date_range: string;
}

export interface OptimizationSummary {
  symbol: string;
  best_pair: MAOptimizationResult | null;
  top_5_pairs: MAOptimizationResult[];
  all_results: MAOptimizationResult[];
  optimization_date: Date;
  parameters_used: any;
}

export class MAOptimizer {
  private initialCapital: number;
  private atrPeriod: number;
  private atrMultiplier: number;
  private maType: string;

  constructor(
    initialCapital: number = 100000,
    atrPeriod: number = 14,
    atrMultiplier: number = 2.0,
    maType: string = 'ema'
  ) {
    this.initialCapital = initialCapital;
    this.atrPeriod = atrPeriod;
    this.atrMultiplier = atrMultiplier;
    this.maType = maType;
  }

  /**
   * Optimize MA pairs for a given symbol
   */
  async optimizeMaPairs(
    symbol: string,
    days: number = 365,
    fastMaRange: [number, number] = [5, 30],
    slowMaRange: [number, number] = [20, 100],
    minDistance: number = 10
  ): Promise<OptimizationSummary> {
    console.log(`Starting MA optimization for ${symbol}`);

    // Get stock data
    const stockData = await getStockData(symbol, days);
    if (!stockData || stockData.length < 100) {
      throw new Error(`Insufficient data for ${symbol}`);
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

    // Generate all valid MA pairs
    const maPairs = this.generateMaPairs(fastMaRange, slowMaRange, minDistance);
    console.log(`Testing ${maPairs.length} MA pairs for ${symbol}`);

    // Test each pair
    const results: MAOptimizationResult[] = [];
    for (const [fastMa, slowMa] of maPairs) {
      try {
        const result = await this.testMaPair(data, symbol, fastMa, slowMa);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.warn(`Failed to test pair (${fastMa}, ${slowMa}):`, error);
        continue;
      }
    }

    // Sort by total return
    results.sort((a, b) => b.total_return_percent - a.total_return_percent);

    // Create summary
    const summary: OptimizationSummary = {
      symbol,
      best_pair: results.length > 0 ? results[0] : null,
      top_5_pairs: results.slice(0, 5),
      all_results: results,
      optimization_date: new Date(),
      parameters_used: {
        fast_ma_range: fastMaRange,
        slow_ma_range: slowMaRange,
        min_distance: minDistance,
        days,
        atr_period: this.atrPeriod,
        atr_multiplier: this.atrMultiplier,
        ma_type: this.maType
      }
    };

    console.log(`Optimization complete for ${symbol}. Best pair: ${summary.best_pair?.fast_ma},${summary.best_pair?.slow_ma}`);
    return summary;
  }

  /**
   * Compare specific MA pairs for a symbol
   */
  async compareMaPairs(
    symbol: string,
    maPairs: Array<[number, number]>,
    days: number = 365
  ): Promise<MAOptimizationResult[]> {
    console.log(`Comparing ${maPairs.length} MA pairs for ${symbol}`);

    const stockData = await getStockData(symbol, days);
    if (!stockData) {
      throw new Error(`No data available for ${symbol}`);
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

    const results: MAOptimizationResult[] = [];
    for (const [fastMa, slowMa] of maPairs) {
      try {
        const result = await this.testMaPair(data, symbol, fastMa, slowMa);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.warn(`Failed to test pair (${fastMa}, ${slowMa}):`, error);
        continue;
      }
    }

    return results.sort((a, b) => b.total_return_percent - a.total_return_percent);
  }

  /**
   * Generate all valid MA pairs within the specified ranges
   */
  private generateMaPairs(
    fastRange: [number, number],
    slowRange: [number, number],
    minDistance: number
  ): Array<[number, number]> {
    const pairs: Array<[number, number]> = [];

    for (let fastMa = fastRange[0]; fastMa <= fastRange[1]; fastMa++) {
      for (let slowMa = slowRange[0]; slowMa <= slowRange[1]; slowMa++) {
        if (slowMa - fastMa >= minDistance) {
          pairs.push([fastMa, slowMa]);
        }
      }
    }

    return pairs;
  }

  /**
   * Test a specific MA pair and return performance metrics
   */
  private async testMaPair(
    data: StockData[],
    symbol: string,
    fastMa: number,
    slowMa: number
  ): Promise<MAOptimizationResult | null> {
    try {
      // Create trading engine with custom MA periods
      const engine = new MATradingEngine(
        this.initialCapital,
        this.atrPeriod,
        this.atrMultiplier,
        this.maType,
        fastMa,
        slowMa
      );

      // Run analysis
      const results = await engine.runAnalysis(data, symbol);

      if (!results || !results.trades || results.trades.length === 0) {
        return null;
      }

      // Calculate additional metrics
      const sharpeRatio = this.calculateSharpeRatio(results.trades);
      const maxDrawdown = this.calculateMaxDrawdown(results.equity_curve);
      const profitFactor = this.calculateProfitFactor(results.trades);
      const avgDuration = results.trades.reduce((sum, t) => sum + (t.duration_days || 0), 0) / results.trades.length;

      return {
        fast_ma: fastMa,
        slow_ma: slowMa,
        ma_distance: slowMa - fastMa,
        total_return_percent: results.performance_metrics.total_return_percent,
        sharpe_ratio: sharpeRatio,
        max_drawdown: maxDrawdown,
        win_rate: results.performance_metrics.win_rate,
        profit_factor: profitFactor,
        total_trades: results.performance_metrics.total_trades,
        avg_trade_duration: avgDuration,
        symbol,
        date_range: `${data[0].date.toISOString().split('T')[0]} to ${data[data.length - 1].date.toISOString().split('T')[0]}`
      };
    } catch (error) {
      console.warn(`Error testing pair (${fastMa}, ${slowMa}):`, error);
      return null;
    }
  }

  /**
   * Calculate Sharpe ratio from trade returns
   */
  private calculateSharpeRatio(trades: any[]): number {
    if (!trades || trades.length < 2) return 0.0;

    const returns = trades
      .filter(t => t.pnl_percent !== undefined)
      .map(t => t.pnl_percent);

    if (returns.length < 2) return 0.0;

    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);
    const stdReturn = Math.sqrt(variance);

    if (stdReturn === 0) return 0.0;

    // Assuming risk-free rate of 2% annually
    const riskFreeRate = 2.0 / 252; // Daily risk-free rate
    return (meanReturn - riskFreeRate) / stdReturn;
  }

  /**
   * Calculate maximum drawdown from equity curve
   */
  private calculateMaxDrawdown(equityCurve: Array<[Date, number]>): number {
    if (!equityCurve || equityCurve.length < 2) return 0.0;

    const equityValues = equityCurve.map(point => point[1]);
    let peak = equityValues[0];
    let maxDd = 0.0;

    for (const value of equityValues) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDd) {
        maxDd = drawdown;
      }
    }

    return maxDd * 100; // Return as percentage
  }

  /**
   * Calculate profit factor (gross profit / gross loss)
   */
  private calculateProfitFactor(trades: any[]): number {
    if (!trades || trades.length === 0) return 0.0;

    const grossProfit = trades
      .filter(t => t.pnl && t.pnl > 0)
      .reduce((sum, t) => sum + t.pnl, 0);

    const grossLoss = Math.abs(trades
      .filter(t => t.pnl && t.pnl < 0)
      .reduce((sum, t) => sum + t.pnl, 0));

    if (grossLoss === 0) {
      return grossProfit > 0 ? Infinity : 0.0;
    }

    return grossProfit / grossLoss;
  }
}

/**
 * Optimize MA pairs for a specific symbol
 */
router.get('/optimize/:symbol', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const days = parseInt(req.query.days as string) || 365;
  const fastRangeStr = (req.query.fast_range as string) || '5,30';
  const slowRangeStr = (req.query.slow_range as string) || '20,100';
  const minDistance = parseInt(req.query.min_distance as string) || 10;
  const initialCapital = parseFloat(req.query.initial_capital as string) || 100000;
  const atrPeriod = parseInt(req.query.atr_period as string) || 14;
  const atrMultiplier = parseFloat(req.query.atr_multiplier as string) || 2.0;
  const maType = (req.query.ma_type as string) || 'ema';

  // Parse ranges
  const fastRange: [number, number] = fastRangeStr.split(',').map(Number) as [number, number];
  const slowRange: [number, number] = slowRangeStr.split(',').map(Number) as [number, number];

  // Validate parameters
  if (fastRange[0] >= fastRange[1]) {
    throw createError('Invalid fast_range: min must be less than max', 400);
  }
  if (slowRange[0] >= slowRange[1]) {
    throw createError('Invalid slow_range: min must be less than max', 400);
  }
  if (maType !== 'ema' && maType !== 'sma') {
    throw createError('ma_type must be "ema" or "sma"', 400);
  }

  console.log(`Optimizing MA pairs for ${symbol}`);

  // Create optimizer
  const optimizer = new MAOptimizer(initialCapital, atrPeriod, atrMultiplier, maType);

  // Run optimization
  const results = await optimizer.optimizeMaPairs(symbol, days, fastRange, slowRange, minDistance);

  // Convert to JSON-serializable format
  const response = {
    symbol: results.symbol,
    optimization_date: results.optimization_date.toISOString(),
    parameters_used: results.parameters_used,
    best_pair: results.best_pair ? {
      fast_ma: results.best_pair.fast_ma,
      slow_ma: results.best_pair.slow_ma,
      ma_distance: results.best_pair.ma_distance,
      total_return_percent: results.best_pair.total_return_percent,
      sharpe_ratio: results.best_pair.sharpe_ratio,
      max_drawdown: results.best_pair.max_drawdown,
      win_rate: results.best_pair.win_rate,
      profit_factor: results.best_pair.profit_factor,
      total_trades: results.best_pair.total_trades,
      avg_trade_duration: results.best_pair.avg_trade_duration,
      date_range: results.best_pair.date_range
    } : null,
    top_5_pairs: results.top_5_pairs.map(pair => ({
      fast_ma: pair.fast_ma,
      slow_ma: pair.slow_ma,
      ma_distance: pair.ma_distance,
      total_return_percent: pair.total_return_percent,
      sharpe_ratio: pair.sharpe_ratio,
      max_drawdown: pair.max_drawdown,
      win_rate: pair.win_rate,
      profit_factor: pair.profit_factor,
      total_trades: pair.total_trades,
      avg_trade_duration: pair.avg_trade_duration
    })),
    total_pairs_tested: results.all_results.length,
    summary_stats: {
      avg_return: results.all_results.length > 0 
        ? results.all_results.reduce((sum, p) => sum + p.total_return_percent, 0) / results.all_results.length 
        : 0,
      max_return: results.all_results.length > 0 
        ? Math.max(...results.all_results.map(p => p.total_return_percent)) 
        : 0,
      min_return: results.all_results.length > 0 
        ? Math.min(...results.all_results.map(p => p.total_return_percent)) 
        : 0,
      avg_sharpe: results.all_results.length > 0 
        ? results.all_results.reduce((sum, p) => sum + p.sharpe_ratio, 0) / results.all_results.length 
        : 0,
      avg_trades: results.all_results.length > 0 
        ? results.all_results.reduce((sum, p) => sum + p.total_trades, 0) / results.all_results.length 
        : 0
    }
  };

  res.json(response);
}));

/**
 * Compare specific MA pairs for a symbol
 */
router.get('/compare-pairs/:symbol', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const pairsStr = (req.query.pairs as string) || '10,20|21,50|30,60';
  const days = parseInt(req.query.days as string) || 365;
  const initialCapital = parseFloat(req.query.initial_capital as string) || 100000;
  const atrPeriod = parseInt(req.query.atr_period as string) || 14;
  const atrMultiplier = parseFloat(req.query.atr_multiplier as string) || 2.0;
  const maType = (req.query.ma_type as string) || 'ema';

  // Parse MA pairs
  const maPairs: Array<[number, number]> = [];
  for (const pairStr of pairsStr.split('|')) {
    try {
      const [fast, slow] = pairStr.split(',').map(Number);
      if (fast >= slow) {
        throw createError(`Invalid pair ${pairStr}: fast MA must be less than slow MA`, 400);
      }
      maPairs.push([fast, slow]);
    } catch (error) {
      throw createError(`Invalid pair format: ${pairStr}. Use "fast,slow"`, 400);
    }
  }

  if (maPairs.length === 0) {
    throw createError('No valid MA pairs provided', 400);
  }

  console.log(`Comparing ${maPairs.length} MA pairs for ${symbol}`);

  // Create optimizer
  const optimizer = new MAOptimizer(initialCapital, atrPeriod, atrMultiplier, maType);

  // Run comparison
  const results = await optimizer.compareMaPairs(symbol, maPairs, days);

  // Convert to JSON-serializable format
  const response = {
    symbol,
    pairs_compared: results.length,
    results: results.map(result => ({
      fast_ma: result.fast_ma,
      slow_ma: result.slow_ma,
      ma_distance: result.ma_distance,
      total_return_percent: result.total_return_percent,
      sharpe_ratio: result.sharpe_ratio,
      max_drawdown: result.max_drawdown,
      win_rate: result.win_rate,
      profit_factor: result.profit_factor,
      total_trades: result.total_trades,
      avg_trade_duration: result.avg_trade_duration,
      date_range: result.date_range
    })),
    best_pair: results.length > 0 ? {
      fast_ma: results[0].fast_ma,
      slow_ma: results[0].slow_ma,
      total_return_percent: results[0].total_return_percent
    } : null
  };

  res.json(response);
}));

/**
 * Generate data for MA pair performance heatmap
 */
router.get('/heatmap/:symbol', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const days = parseInt(req.query.days as string) || 365;
  const fastRangeStr = (req.query.fast_range as string) || '5,30';
  const slowRangeStr = (req.query.slow_range as string) || '20,100';
  const minDistance = parseInt(req.query.min_distance as string) || 10;
  const metric = (req.query.metric as string) || 'return';

  // Parse ranges
  const fastRange: [number, number] = fastRangeStr.split(',').map(Number) as [number, number];
  const slowRange: [number, number] = slowRangeStr.split(',').map(Number) as [number, number];

  // Validate metric
  const validMetrics = ['return', 'sharpe', 'win_rate', 'profit_factor'];
  if (!validMetrics.includes(metric)) {
    throw createError(`Invalid metric. Must be one of: ${validMetrics.join(', ')}`, 400);
  }

  console.log(`Generating heatmap data for ${symbol} using ${metric} metric`);

  // Create optimizer
  const optimizer = new MAOptimizer();

  // Run optimization
  const results = await optimizer.optimizeMaPairs(symbol, days, fastRange, slowRange, minDistance);

  // Create heatmap data
  const heatmapData = results.all_results.map(result => {
    const metricMap: { [key: string]: string } = {
      'return': 'total_return_percent',
      'sharpe': 'sharpe_ratio',
      'win_rate': 'win_rate',
      'profit_factor': 'profit_factor'
    };
    const value = (result as any)[metricMap[metric]];

    return {
      fast_ma: result.fast_ma,
      slow_ma: result.slow_ma,
      value,
      total_trades: result.total_trades
    };
  });

  const response = {
    symbol,
    metric,
    fast_range: fastRange,
    slow_range: slowRange,
    heatmap_data: heatmapData,
    best_value: heatmapData.length > 0 ? Math.max(...heatmapData.map(d => d.value)) : 0,
    worst_value: heatmapData.length > 0 ? Math.min(...heatmapData.map(d => d.value)) : 0
  };

  res.json(response);
}));

export default router;
