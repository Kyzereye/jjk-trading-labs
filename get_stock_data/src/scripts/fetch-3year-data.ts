#!/usr/bin/env node
/**
 * Fetch 3 years of historical stock data for all symbols from database
 * AND run performance analysis to populate stock_performance_metrics table
 */

import yahooFinance from 'yahoo-finance2';
import { DatabaseService, StockData } from '../services/database.service';
import { PerformanceAnalyzer, AnalysisParams } from '../services/performance-analyzer.service';

// Default analysis parameters for top performers
const DEFAULT_ANALYSIS_PARAMS: AnalysisParams = {
  initial_capital: 100000,
  atr_period: 14,
  atr_multiplier: 2.0,
  ma_type: 'ema',
  position_sizing_percentage: 5.0,
  days: 0, // Use all available data
  mean_reversion_threshold: 10.0
};

async function fetchStockData(symbol: string, period: string = '3y'): Promise<StockData[]> {
  try {
    console.log(`Fetching data for ${symbol}...`);
    
    const data = await yahooFinance.historical(symbol, {
      period1: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000), // 3 years ago
      period2: new Date(),
      interval: '1d'
    });
    
    if (!data || data.length === 0) {
      console.log(`No data found for ${symbol}`);
      return [];
    }

    // Convert to our format
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
  console.log('🚀 Starting 3-year data fetch and performance analysis...');
  console.log('📊 This will:');
  console.log('   1. Fetch 3 years of stock data from Yahoo Finance');
  console.log('   2. Store data in MySQL database');
  console.log('   3. Run MA trading analysis on each symbol');
  console.log('   4. Store performance metrics for Top Performers\n');
  
  const db = new DatabaseService();
  const analyzer = new PerformanceAnalyzer();
  
  try {
    // Get symbols from database
    console.log('📊 Loading symbols from database...');
    const symbols = await db.getAllSymbols();

    if (symbols.length === 0) {
      console.error('❌ No symbols found in database!');
      console.error('Please run the SQL script to populate stock_symbols table first.');
      process.exit(1);
    }

    console.log(`✅ Found ${symbols.length} symbols to process\n`);

    let successCount = 0;
    let errorCount = 0;
    let analysisSuccessCount = 0;
    let analysisErrorCount = 0;
    const failedSymbols: Array<{symbol: string, reason: string}> = [];

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      
      try {
        console.log(`[${i + 1}/${symbols.length}] Processing ${symbol}...`);
        
        // Fetch data
        const stockData = await fetchStockData(symbol);
        
        if (stockData.length > 0) {
          // Get symbol ID
          const symbolId = await db.getSymbolId(symbol);
          
          // Store in database
          await db.storeStockData(symbolId, stockData);
          console.log(`  ✅ Stored ${stockData.length} days of data`);
          
          successCount++;
          
          // Run performance analysis
          console.log(`  🔬 Running MA trading analysis...`);
          const analysisSuccess = await analyzer.analyzeAndStorePerformance(
            symbol,
            stockData,
            DEFAULT_ANALYSIS_PARAMS
          );
          
          if (analysisSuccess) {
            analysisSuccessCount++;
          } else {
            analysisErrorCount++;
          }
          
        } else {
          errorCount++;
          failedSymbols.push({ symbol, reason: 'No data returned from Yahoo Finance' });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`  ❌ Failed to process ${symbol}:`, error);
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        failedSymbols.push({ symbol, reason: errorMessage });
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 FINAL SUMMARY');
    console.log(`${'='.repeat(70)}`);
    console.log(`✅ Data fetch successful: ${successCount} symbols`);
    console.log(`❌ Data fetch failed: ${errorCount} symbols`);
    console.log(`✅ Performance analysis successful: ${analysisSuccessCount} symbols`);
    console.log(`❌ Performance analysis failed: ${analysisErrorCount} symbols`);
    
    if (failedSymbols.length > 0) {
      console.log(`\n⚠️  Failed Symbols:`);
      failedSymbols.forEach(({ symbol, reason }) => {
        console.log(`   • ${symbol}: ${reason}`);
      });
    }
    
    console.log(`\n💾 All data stored in MySQL database`);
    console.log(`📈 Top performers data ready for querying!`);
    console.log(`${'='.repeat(70)}\n`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await db.close();
    await analyzer.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
