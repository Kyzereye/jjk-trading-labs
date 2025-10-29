#!/usr/bin/env node
/**
 * Utility script to analyze a single symbol
 * Usage: npm run analyze-symbol SYMBOL
 * Example: npm run analyze-symbol AAPL
 */

import yahooFinance from 'yahoo-finance2';
import { DatabaseService, StockData } from '../services/database.service';
import { PerformanceAnalyzer } from '../services/performance-analyzer.service';

const SYMBOL = process.argv[2] || 'AAPL';

const TIME_PERIODS = [
  {
    label: 'ALL',
    days: 0,
    params: {
      initial_capital: 100000,
      atr_period: 14,
      atr_multiplier_long: 2.0,
      atr_multiplier_short: 1.5,
      ma_type: 'ema' as const,
      position_sizing_long: 5.0,
      position_sizing_short: 3.0,
      days: 0,
      mean_reversion_threshold: 10.0
    }
  }
];

const STRATEGY_MODES = ['long'] as const;

async function fetchStockData(symbol: string): Promise<StockData[]> {
  try {
    console.log(`Fetching data for ${symbol}...`);
    
    const data = await yahooFinance.historical(symbol, {
      period1: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000),
      period2: new Date(),
      interval: '1d'
    });
    
    if (!data || data.length === 0) {
      console.log(`No data found for ${symbol}`);
      return [];
    }

    const stockData: StockData[] = data.map((row: any) => ({
      date: new Date(row.date),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseInt(row.volume)
    }));

    console.log(`Fetched ${stockData.length} records for ${symbol}`);
    return stockData;
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error);
    return [];
  }
}

async function main() {
  console.log(`📊 Analyzing ${SYMBOL}\n`);
  
  const db = new DatabaseService();
  const analyzer = new PerformanceAnalyzer();
  
  try {
    const stockData = await fetchStockData(SYMBOL);
    
    if (stockData.length > 0) {
      const symbolId = await db.getSymbolId(SYMBOL);
      
      await db.storeStockData(symbolId, stockData);
      console.log(`✅ Stored ${stockData.length} days of data\n`);
      
      console.log(`🔬 Running analysis...`);
      
      const period = TIME_PERIODS[0];
      const strategyMode = STRATEGY_MODES[0];
      
      const analysisParams = {
        ...period.params,
        strategy_mode: strategyMode
      };
      
      const result = await analyzer.analyzeAndStorePerformance(
        SYMBOL,
        stockData,
        analysisParams,
        period.label
      );
      
      if (result.success) {
        console.log(`✅ Analysis completed successfully`);
      } else {
        console.log(`❌ Analysis failed:`, result.error);
      }
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await db.close();
    await analyzer.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}


