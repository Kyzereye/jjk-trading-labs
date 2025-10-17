#!/usr/bin/env node
/**
 * Fetch 3 years of historical stock data for all symbols from database
 */

import yahooFinance from 'yahoo-finance2';
import { DatabaseService, StockData } from '../services/database.service';

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
  console.log('🚀 Starting 3-year data fetch...');
  
  const db = new DatabaseService();
  
  try {
    // Get symbols from database
    console.log('📊 Loading symbols from database...');
    const symbols = await db.getAllSymbols();

    if (symbols.length === 0) {
      console.error('❌ No symbols found in database!');
      console.error('Please run the SQL script to populate stock_symbols table first.');
      process.exit(1);
    }

    console.log(`✅ Found ${symbols.length} symbols to process`);

    let successCount = 0;
    let errorCount = 0;
    const failedSymbols: Array<{symbol: string, reason: string}> = [];

    for (const symbol of symbols) {
      try {
        // Fetch data
        const stockData = await fetchStockData(symbol);
        
        if (stockData.length > 0) {
          // Get symbol ID
          const symbolId = await db.getSymbolId(symbol);
          
          // Store in database
          await db.storeStockData(symbolId, stockData);
          console.log(`Stored ${stockData.length} records for ${symbol}`);
          
          successCount++;
        } else {
          errorCount++;
          failedSymbols.push({ symbol, reason: 'No data returned from Yahoo Finance' });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Failed to process ${symbol}:`, error);
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        failedSymbols.push({ symbol, reason: errorMessage });
      }
    }

    console.log(`\n✅ Data fetch complete!`);
    console.log(`📊 Successfully processed: ${successCount} symbols`);
    console.log(`❌ Failed: ${errorCount} symbols`);
    
    if (failedSymbols.length > 0) {
      console.log(`\n⚠️  Failed Symbols:`);
      failedSymbols.forEach(({ symbol, reason }) => {
        console.log(`   • ${symbol}: ${reason}`);
      });
    }
    
    console.log(`\n💾 All data stored in MySQL database`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await db.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
