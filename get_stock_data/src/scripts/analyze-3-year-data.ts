#!/usr/bin/env node
/**
 * Analyze stock data already stored in MySQL and write performance metrics.
 *
 * Usage:
 *   npm run analyze-3year
 *   npm run analyze-3year -- AAPL
 */

import { DatabaseService, StockData } from '../services/database.service';
import { PerformanceAnalyzer } from '../services/performance-analyzer.service';

// Optional symbol filter from CLI arg.
const SYMBOL_FILTER = process.argv[2]?.toUpperCase();

const TIME_PERIODS = [
  {
    label: 'ALL',
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

const STRATEGY_MODES = ['long', 'short', 'both'] as const;

async function main() {
  console.log(SYMBOL_FILTER
    ? `🚀 Analysis-only mode for ${SYMBOL_FILTER}...`
    : '🚀 Analysis-only mode: running MA trading analysis on data already in database...');

  const db = new DatabaseService();
  const analyzer = new PerformanceAnalyzer();

  try {
    console.log('📊 Loading symbols from database...');
    let symbols = await db.getAllSymbols();

    if (SYMBOL_FILTER) {
      symbols = symbols.filter(s => s.toUpperCase() === SYMBOL_FILTER);
      if (symbols.length === 0) {
        console.error(`❌ Symbol ${SYMBOL_FILTER} not found in stock_symbols.`);
        process.exit(1);
      }
    }

    if (symbols.length === 0) {
      console.error('❌ No symbols found in database!');
      process.exit(1);
    }

    console.log(`✅ Found ${symbols.length} symbols to process\n`);

    let analysisSuccessCount = 0;
    let analysisErrorCount = 0;
    const failedSymbols: Array<{ symbol: string; successful: number; total: number; errors: string[] }> = [];

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      console.log(`[${i + 1}/${symbols.length}] Processing ${symbol}...`);

      try {
        const stockData: StockData[] = await db.getStockData(symbol);
        if (!stockData.length) {
          analysisErrorCount++;
          failedSymbols.push({
            symbol,
            successful: 0,
            total: TIME_PERIODS.length * STRATEGY_MODES.length,
            errors: ['No data in database']
          });
          console.log('  ⚠️  No data in database');
          continue;
        }

        console.log('  🔬 Running MA trading analysis for ALL periods & strategies...');
        let periodSuccessCount = 0;
        const totalAnalyses = TIME_PERIODS.length * STRATEGY_MODES.length;
        const analysisErrors: string[] = [];

        for (const period of TIME_PERIODS) {
          for (const strategyMode of STRATEGY_MODES) {
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
          failedSymbols.push({
            symbol,
            successful: 0,
            total: totalAnalyses,
            errors: analysisErrors
          });
          console.log(`  ⚠️  Analysis failed for all ${totalAnalyses} configurations`);
        } else {
          analysisSuccessCount++;
          failedSymbols.push({
            symbol,
            successful: periodSuccessCount,
            total: totalAnalyses,
            errors: analysisErrors
          });
          console.log(`  ⚠️  Analysis partially successful: ${periodSuccessCount}/${totalAnalyses} configurations passed`);
        }
      } catch (error) {
        analysisErrorCount++;
        failedSymbols.push({
          symbol,
          successful: 0,
          total: TIME_PERIODS.length * STRATEGY_MODES.length,
          errors: [error instanceof Error ? error.message : String(error)]
        });
        console.log('  ⚠️  Analysis failed due to runtime error');
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 FINAL SUMMARY');
    console.log(`${'='.repeat(70)}`);
    console.log(`✅ Symbols analyzed successfully: ${analysisSuccessCount}`);
    console.log(`❌ Symbols with analysis failure: ${analysisErrorCount}`);

    if (failedSymbols.length > 0) {
      console.log('\n⚠️  Analysis Failed/Partial Symbols:');
      failedSymbols.forEach(({ symbol, successful, total, errors }) => {
        if (successful === 0) {
          console.log(`   • ${symbol}: 0/${total} analyses succeeded (TOTAL FAILURE)`);
        } else {
          console.log(`   • ${symbol}: ${successful}/${total} analyses succeeded (PARTIAL)`);
        }

        const uniqueErrors = [...new Set(errors.map(e => e.split(': ')[1] || e))];
        uniqueErrors.forEach(error => {
          console.log(`     └─ ${error}`);
        });
      });
    }

    console.log('\n💾 Performance metrics stored in MySQL database');
    console.log('📈 Top performers data ready for querying!');
    console.log(`${'='.repeat(70)}\n`);
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
