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
  atr_multiplier: number;
  ma_type: 'ema' | 'sma';
  position_sizing_percentage: number;
  days: number;
  mean_reversion_threshold?: number;
  custom_fast_ma?: number;
  custom_slow_ma?: number;
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
    analysisDate?: Date
  ): Promise<boolean> {
    try {
      if (!analysisDate) {
        analysisDate = new Date();
      }

      if (!stockData || stockData.length < 30) {
        console.log(`  ⚠️  Insufficient data for ${symbol}: ${stockData?.length || 0} days`);
        return false;
      }

      const {
        initial_capital = 100000,
        atr_period = 14,
        atr_multiplier = 2.0,
        ma_type = 'ema',
        position_sizing_percentage = 5.0,
        mean_reversion_threshold = 10.0,
        custom_fast_ma = undefined,
        custom_slow_ma = undefined
      } = analysisParams;

      const engine = new MATradingEngine(
        initial_capital,
        atr_period,
        atr_multiplier,
        ma_type,
        custom_fast_ma || undefined,
        custom_slow_ma || undefined,
        mean_reversion_threshold,
        position_sizing_percentage
      );

      const results = await engine.runAnalysis(stockData, symbol);

      const totalTrades = results.trades.length;
      const winningTrades = results.trades.filter(t => t.pnl && t.pnl > 0).length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;

      const totalPnl = results.performance_metrics.total_pnl;
      const sharpeRatio = results.performance_metrics.sharpe_ratio;
      const totalReturnPct = (totalPnl / initial_capital) * 100;

      const symbolId = await this.db.getSymbolId(symbol);

      await this.storePerformanceMetrics(
        symbolId,
        analysisDate,
        totalReturnPct,
        totalPnl,
        winRate,
        totalTrades,
        sharpeRatio,
        analysisParams
      );

      console.log(`  ✅ Performance analysis: ${totalReturnPct.toFixed(2)}% return, ${totalTrades} trades`);
      return true;

    } catch (error) {
      console.error(`  ❌ Error analyzing ${symbol}:`, error);
      return false;
    }
  }

  private async storePerformanceMetrics(
    symbolId: number,
    analysisDate: Date,
    totalReturnPct: number,
    totalPnl: number,
    winRate: number,
    totalTrades: number,
    sharpeRatio: number,
    analysisParams: AnalysisParams
  ): Promise<void> {
    const query = `
      INSERT INTO stock_performance_metrics 
      (symbol_id, analysis_date, total_return_pct, total_pnl, win_rate, total_trades, sharpe_ratio, analysis_params)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
}

