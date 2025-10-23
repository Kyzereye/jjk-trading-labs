#!/usr/bin/env node
/**
 * Fetch 3 years of historical stock data for all symbols from database
 * AND run performance analysis to populate stock_performance_metrics table
 */

import yahooFinance from 'yahoo-finance2';
import { DatabaseService, StockData } from '../services/database.service';
import { PerformanceAnalyzer, AnalysisParams } from '../services/performance-analyzer.service';

// Analysis parameters for different time periods
const TIME_PERIODS = [
  {
    label: 'ALL',
    days: 0, // Use all available data
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
  },
  {
    label: '1Y',
    days: 365, // Last 1 year
    params: {
      initial_capital: 100000,
      atr_period: 14,
      atr_multiplier_long: 2.0,
      atr_multiplier_short: 1.5,
      ma_type: 'ema' as const,
      position_sizing_long: 5.0,
      position_sizing_short: 3.0,
      days: 365,
      mean_reversion_threshold: 10.0
    }
  }
];

// Strategy modes to analyze
const STRATEGY_MODES = ['long', 'short', 'both'] as const;

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
  console.log('   3. Run MA trading analysis on each symbol:');
  console.log('      • Time periods: ALL data + 1 Year');
  console.log('      • Strategy modes: LONG, SHORT, BOTH');
  console.log('      • Total: 6 analyses per symbol');
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
    const analysisFailedSymbols: Array<{symbol: string, successful: number, total: number, errors: string[]}> = [];

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
          
          // Run performance analysis for each time period and strategy mode
          console.log(`  🔬 Running MA trading analysis for ALL periods & strategies...`);
          let periodSuccessCount = 0;
          const totalAnalyses = TIME_PERIODS.length * STRATEGY_MODES.length;
          const analysisErrors: string[] = [];
          
          for (const period of TIME_PERIODS) {
            for (const strategyMode of STRATEGY_MODES) {
              console.log(`     ⏱  Analyzing ${period.label} - ${strategyMode.toUpperCase()}...`);
              
              const analysisParams = {
                ...period.params,
                strategy_mode: strategyMode
              };
              
              const result = await analyzer.analyzeAndStorePerformance(
                symbol,
                stockData,
                analysisParams,
                period.label
              );
              
              if (result.success) {
                periodSuccessCount++;
              } else if (result.error) {
                analysisErrors.push(`${period.label}-${strategyMode.toUpperCase()}: ${result.error}`);
              }
            }
          }
          
          if (periodSuccessCount === totalAnalyses) {
            analysisSuccessCount++;
          } else if (periodSuccessCount === 0) {
            analysisErrorCount++;
            analysisFailedSymbols.push({ 
              symbol, 
              successful: 0, 
              total: totalAnalyses,
              errors: analysisErrors
            });
            console.log(`  ⚠️  Analysis failed for all ${totalAnalyses} configurations`);
          } else {
            // Partial success
            analysisSuccessCount++;
            analysisFailedSymbols.push({ 
              symbol, 
              successful: periodSuccessCount, 
              total: totalAnalyses,
              errors: analysisErrors
            });
            console.log(`  ⚠️  Analysis partially successful: ${periodSuccessCount}/${totalAnalyses} configurations passed`);
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
      console.log(`\n⚠️  Data Fetch Failed Symbols:`);
      failedSymbols.forEach(({ symbol, reason }) => {
        console.log(`   • ${symbol}: ${reason}`);
      });
    }
    
    if (analysisFailedSymbols.length > 0) {
      console.log(`\n⚠️  Analysis Failed/Partial Symbols:`);
      analysisFailedSymbols.forEach(({ symbol, successful, total, errors }) => {
        if (successful === 0) {
          console.log(`   • ${symbol}: 0/${total} analyses succeeded (TOTAL FAILURE)`);
        } else {
          console.log(`   • ${symbol}: ${successful}/${total} analyses succeeded (PARTIAL)`);
        }
        
        // Show unique error messages
        if (errors.length > 0) {
          const uniqueErrors = [...new Set(errors.map(e => e.split(': ')[1]))];
          uniqueErrors.forEach(error => {
            console.log(`     └─ ${error}`);
          });
        }
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
