#!/usr/bin/env node
/**
 * Update stock data with latest daily data
 */

import yahooFinance from 'yahoo-finance2';
import { DatabaseService, StockData } from '../services/database.service';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';

const CSV_DIR = 'csv_files';

async function fetchLatestData(symbol: string, startDate: Date): Promise<StockData[]> {
  try {
    console.log(`Fetching latest data for ${symbol} from ${startDate.toISOString().split('T')[0]}...`);
    
    const data = await yahooFinance.historical(symbol, {
      period1: startDate,
      period2: new Date(),
      interval: '1d'
    });
    
    if (!data || data.length === 0) {
      console.log(`No new data found for ${symbol}`);
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

    console.log(`Fetched ${stockData.length} new records for ${symbol}`);
    return stockData;
  } catch (error) {
    console.error(`Error fetching latest data for ${symbol}:`, error);
    return [];
  }
}

async function appendToCSV(symbol: string, data: StockData[]): Promise<void> {
  if (data.length === 0) return;

  const csvPath = path.join(CSV_DIR, `${symbol}_daily_update.csv`);
  
  // Ensure CSV directory exists
  if (!fs.existsSync(CSV_DIR)) {
    fs.mkdirSync(CSV_DIR, { recursive: true });
  }

  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: 'date', title: 'Date' },
      { id: 'open', title: 'Open' },
      { id: 'high', title: 'High' },
      { id: 'low', title: 'Low' },
      { id: 'close', title: 'Close' },
      { id: 'volume', title: 'Volume' }
    ],
    append: fs.existsSync(csvPath)
  });

  await csvWriter.writeRecords(data);
  console.log(`Appended ${data.length} records to CSV for ${symbol}`);
}

async function cleanupOldData(db: DatabaseService): Promise<void> {
  try {
    console.log('🧹 Cleaning up data older than 3 years...');
    
    const [result] = await db.execute(
      'DELETE FROM daily_stock_data WHERE date < DATE_SUB(CURDATE(), INTERVAL 3 YEAR)',
      []
    );
    
    const deletedRows = (result as any).affectedRows;
    console.log(`✅ Cleaned up ${deletedRows} old records`);
    
  } catch (error) {
    console.error('Error cleaning up old data:', error);
  }
}

async function main() {
  console.log('🔄 Starting daily data update...');
  
  const db = new DatabaseService();
  
  try {
    // Get all symbols from database
    console.log('📊 Loading symbols from database...');
    const symbols = await db.getAllSymbols();
    
    if (symbols.length === 0) {
      console.error('❌ No symbols found in database!');
      console.error('Please run the SQL script to populate stock_symbols table first.');
      process.exit(1);
    }
    
    console.log(`Found ${symbols.length} symbols to update`);

    let successCount = 0;
    let errorCount = 0;
    let totalNewRecords = 0;

    for (const symbol of symbols) {
      try {
        // Get symbol ID
        const symbolId = await db.getSymbolId(symbol);
        
        // Get latest date in database
        const latestDate = await db.getLatestDate(symbolId);
        
        // Calculate start date (next day after latest)
        const startDate = latestDate 
          ? new Date(latestDate.getTime() + 24 * 60 * 60 * 1000)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago if no data

        // Only fetch if we need new data
        if (startDate < new Date()) {
          const stockData = await fetchLatestData(symbol, startDate);
          
          if (stockData.length > 0) {
            // Store in database
            await db.storeStockData(symbolId, stockData);
            
            // Save to CSV
            await appendToCSV(symbol, stockData);
            
            totalNewRecords += stockData.length;
            successCount++;
          } else {
            console.log(`No new data for ${symbol}`);
          }
        } else {
          console.log(`${symbol} is up to date`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Failed to update ${symbol}:`, error);
        errorCount++;
      }
    }

    console.log(`\n✅ Daily update complete!`);
    console.log(`📊 Successfully updated: ${successCount} symbols`);
    console.log(`📈 Total new records: ${totalNewRecords}`);
    console.log(`❌ Failed: ${errorCount} symbols`);
    console.log(`📁 Update files saved in: ${CSV_DIR}/`);

    // Clean up old data (older than 3 years)
    await cleanupOldData(db);

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
