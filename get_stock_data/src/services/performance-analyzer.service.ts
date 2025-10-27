/**
 * Performance Analyzer Service
 * Analyzes stock performance and stores results in database
 * Ported from Python backend/utils/performance_analyzer.py
 */

import { DatabaseService, StockData } from './database.service';
import { MATradingEngine, MAResults } from '../../../backend/src/services/trading-engine.service';

export interface AnalysisParams {
  initial_capital: number;
  atr_period: number;
  atr_multiplier_long?: number;
  atr_multiplier_short?: number;
  ma_type: 'ema' | 'sma';
  position_sizing_long?: number;
  position_sizing_short?: number;
  days: number;
  mean_reversion_threshold?: number;
  custom_fast_ma?: number;
  custom_slow_ma?: number;
  strategy_mode?: 'long' | 'short' | 'both';
  // Legacy support
  atr_multiplier?: number;
  position_sizing_percentage?: number;
}

export interface PerformanceMetrics {
  symbol_id: number;
  analysis_date: Date;
  total_return_pct: number;
  total_pnl: number;
  win_rate: number;
  total_trades: number;
  sharpe_ratio: number;
  analysis_params: string;
}

export class PerformanceAnalyzer {
  private db: DatabaseService;

  constructor() {
    this.db = new DatabaseService();
  }

  async analyzeAndStorePerformance(
    symbol: string,
    stockData: StockData[],
    analysisParams: AnalysisParams,
    timePeriod: string = 'ALL',
    analysisDate?: Date
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!analysisDate) {
        analysisDate = new Date();
      }

      if (!stockData || stockData.length < 30) {
        const errorMsg = `Insufficient data: ${stockData?.length || 0} days (need at least 30)`;
        console.log(`  ⚠️  ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
      
      // Additional check for sliced data
      let dataToAnalyze = stockData;
      if (analysisParams.days && analysisParams.days > 0) {
        dataToAnalyze = stockData.slice(-analysisParams.days);
        if (dataToAnalyze.length < 60) {
          const errorMsg = `Insufficient data after slicing: ${dataToAnalyze.length} days (need at least 60 for MA calculations)`;
          console.log(`  ⚠️  ${errorMsg}`);
          return { success: false, error: errorMsg };
        }
        console.log(`  ⏱  Using last ${analysisParams.days} days of data (${dataToAnalyze.length} days available)`);
      } else {
        console.log(`  ⏱  Using all ${stockData.length} days of data`);
      }

      const {
        initial_capital = 100000,
        atr_period = 14,
        atr_multiplier = 2.0,
        atr_multiplier_long = atr_multiplier || 2.0,
        atr_multiplier_short = 1.5,
        ma_type = 'ema',
        position_sizing_percentage = 5.0,
        position_sizing_long = position_sizing_percentage || 5.0,
        position_sizing_short = 3.0,
        mean_reversion_threshold = 10.0,
        custom_fast_ma = undefined,
        custom_slow_ma = undefined,
        strategy_mode = 'long'
      } = analysisParams;

      const engine = new MATradingEngine(
        initial_capital,
        atr_period,
        atr_multiplier_long,
        atr_multiplier_short,
        ma_type,
        custom_fast_ma || undefined,
        custom_slow_ma || undefined,
        mean_reversion_threshold,
        position_sizing_long,
        position_sizing_short,
        strategy_mode
      );

      const results = await engine.runAnalysis(dataToAnalyze, symbol);

      // Store recent signals (last 14 days)
      await this.storeRecentSignals(symbol, results.signals, results.mean_reversion_alerts);

      const totalTrades = results.trades.length;
      
      // Check for minimum trades - flat/low volatility stocks may not generate signals
      if (totalTrades === 0) {
        const errorMsg = `No trades generated (flat/low volatility stock - no MA crossover signals)`;
        console.log(`  ⚠️  ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
      
      if (totalTrades < 3) {
        const errorMsg = `Only ${totalTrades} trade(s) generated (insufficient activity for meaningful analysis)`;
        console.log(`  ⚠️  ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
      
      const winningTrades = results.trades.filter(t => t.pnl && t.pnl > 0).length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;

      const totalPnl = results.performance_metrics.total_pnl;
      const sharpeRatio = results.performance_metrics.sharpe_ratio;
      const totalReturnPct = (totalPnl / initial_capital) * 100;

      const symbolId = await this.db.getSymbolId(symbol);

      await this.storePerformanceMetrics(
        symbolId,
        analysisDate,
        timePeriod,
        totalReturnPct,
        totalPnl,
        winRate,
        totalTrades,
        sharpeRatio,
        analysisParams
      );

      console.log(`  ✅ Performance analysis: ${totalReturnPct.toFixed(2)}% return, ${totalTrades} trades`);
      return { success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`  ❌ Error analyzing ${symbol}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  private async storePerformanceMetrics(
    symbolId: number,
    analysisDate: Date,
    timePeriod: string,
    totalReturnPct: number,
    totalPnl: number,
    winRate: number,
    totalTrades: number,
    sharpeRatio: number,
    analysisParams: AnalysisParams
  ): Promise<void> {
    const strategyMode = analysisParams.strategy_mode || 'long';
    
    const query = `
      INSERT INTO stock_performance_metrics 
      (symbol_id, analysis_date, time_period, strategy_mode, total_return_pct, total_pnl, win_rate, total_trades, sharpe_ratio, analysis_params)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      total_return_pct = VALUES(total_return_pct),
      total_pnl = VALUES(total_pnl),
      win_rate = VALUES(win_rate),
      total_trades = VALUES(total_trades),
      sharpe_ratio = VALUES(sharpe_ratio),
      analysis_params = VALUES(analysis_params),
      updated_at = CURRENT_TIMESTAMP
    `;

    const params = [
      symbolId,
      analysisDate.toISOString().split('T')[0],
      timePeriod,
      strategyMode,
      parseFloat(totalReturnPct.toFixed(2)),
      parseFloat(totalPnl.toFixed(2)),
      parseFloat(winRate.toFixed(1)),
      totalTrades,
      parseFloat(sharpeRatio.toFixed(2)),
      JSON.stringify(analysisParams)
    ];

    await this.db.execute(query, params);
  }

  async getTopPerformers(limit: number = 10, analysisDate?: Date): Promise<any[]> {
    try {
      let query = `
        SELECT 
          s.symbol,
          s.company_name,
          p.total_return_pct,
          p.total_pnl,
          p.win_rate,
          p.total_trades,
          p.sharpe_ratio,
          p.analysis_date
        FROM stock_performance_metrics p
        JOIN stock_symbols s ON p.symbol_id = s.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (analysisDate) {
        query += ` AND p.analysis_date = ?`;
        params.push(analysisDate.toISOString().split('T')[0]);
      } else {
        query += ` AND p.analysis_date = (SELECT MAX(analysis_date) FROM stock_performance_metrics)`;
      }

      query += ` ORDER BY p.total_return_pct DESC LIMIT ${limit}`;

      const [rows] = await this.db.execute(query, params);
      return rows as any[];

    } catch (error) {
      console.error('Error getting top performers:', error);
      return [];
    }
  }

  async getAnalysisStats(): Promise<any> {
    try {
      const [totalRows] = await this.db.execute(
        'SELECT COUNT(*) as count FROM stock_performance_metrics',
        []
      );
      const totalAnalyses = (totalRows as any[])[0]?.count || 0;

      const [dateRows] = await this.db.execute(
        'SELECT MAX(analysis_date) as latest FROM stock_performance_metrics',
        []
      );
      const latestDate = (dateRows as any[])[0]?.latest || null;

      const [symbolRows] = await this.db.execute(
        'SELECT COUNT(DISTINCT symbol_id) as count FROM stock_performance_metrics',
        []
      );
      const uniqueSymbols = (symbolRows as any[])[0]?.count || 0;

      return {
        total_analyses: totalAnalyses,
        unique_symbols: uniqueSymbols,
        latest_analysis_date: latestDate
      };

    } catch (error) {
      console.error('Error getting analysis stats:', error);
      return {};
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  /**
   * Store recent trading signals in the database (last 14 trading days)
   */
  async storeRecentSignals(symbol: string, signals: any[], meanReversionAlerts: any[]): Promise<void> {
    try {
      const symbolId = await this.db.getSymbolId(symbol);
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      // Combine signals and alerts, filter to last 14 days, and deduplicate
      const allSignals = [
        ...signals.map(s => ({
          date: s.date,
          signalType: s.signal_type === 'BUY' || s.signal_type === 'SELL_SHORT' ? 'entry' : 
                     s.signal_type === 'SELL' || s.signal_type === 'BUY_TO_COVER' ? 'exit' : null,
          direction: s.position_type || 'long',
          price: s.price,
          ma21: s.ma_21,
          ma50: s.ma_50,
          deviation: null
        })),
        ...meanReversionAlerts.map(a => ({
          date: a.date,
          signalType: 'mean_reversion',
          direction: a.position_type || 'long',
          price: a.price,
          ma21: a.ma_21,
          ma50: null,
          deviation: a.deviation_from_ma21
        }))
      ].filter(s => s.date >= fourteenDaysAgo && s.signalType);

      if (allSignals.length === 0) {
        return;
      }

      // Deduplicate: only keep one signal per day per symbol per type
      const signalMap = new Map<string, any>();
      for (const signal of allSignals) {
        const key = `${signal.date.toISOString().split('T')[0]}_${signal.signalType}_${signal.direction}`;
        if (!signalMap.has(key)) {
          signalMap.set(key, signal);
        }
      }

      const uniqueSignals = Array.from(signalMap.values());

      // Insert signals into database using batch insert
      // Use INSERT IGNORE to skip duplicates without ON DUPLICATE KEY (we want true deduplication)
      const query = `
        INSERT IGNORE INTO trading_signals 
        (symbol_id, signal_type, signal_direction, price, ma21_value, ma50_value, deviation_percent, signal_date)
        VALUES ?
      `;

      const values = uniqueSignals.map(s => [
        symbolId,
        s.signalType,
        s.direction,
        s.price,
        s.ma21 || null,
        s.ma50 || null,
        s.deviation || null,
        s.date
      ]);

      await this.db.query(query, [values]);
      
    } catch (error) {
      console.error(`Error storing signals for ${symbol}:`, error);
    }
  }
}

