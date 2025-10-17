/**
 * Database service for stock data operations
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export interface StockData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class DatabaseService {
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'StockPxLabs',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  /**
   * Execute a query with parameters (for PerformanceAnalyzer)
   */
  async execute(query: string, params: any[]): Promise<[any, any]> {
    return await this.pool.execute(query, params);
  }

  /**
   * Get or create symbol ID
   */
  async getSymbolId(symbol: string): Promise<number> {
    const [rows] = await this.pool.execute(
      'SELECT id FROM stock_symbols WHERE symbol = ?',
      [symbol.toUpperCase()]
    );

    if ((rows as any[]).length > 0) {
      return (rows as any[])[0].id;
    }

    // Create new symbol
    const [result] = await this.pool.execute(
      'INSERT INTO stock_symbols (symbol, company_name) VALUES (?, ?)',
      [symbol.toUpperCase(), symbol.toUpperCase()]
    );

    return (result as any).insertId;
  }

  /**
   * Store stock data in database using batch insert
   */
  async storeStockData(symbolId: number, data: StockData[]): Promise<void> {
    if (data.length === 0) return;

    // Prepare batch data
    const batchData = data.map(item => [
      symbolId,
      item.date,
      item.open,
      item.high,
      item.low,
      item.close,
      item.volume
    ]);

    // Batch insert with duplicate handling
    // Note: Use query() method for batch inserts with VALUES ?, not execute()
    const query = `
      INSERT INTO daily_stock_data (symbol_id, date, open, high, low, close, volume)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        open = VALUES(open),
        high = VALUES(high),
        low = VALUES(low),
        close = VALUES(close),
        volume = VALUES(volume)
    `;

    await this.pool.query(query, [batchData]);
  }

  /**
   * Get latest date for a symbol
   */
  async getLatestDate(symbolId: number): Promise<Date | null> {
    const [rows] = await this.pool.execute(
      'SELECT MAX(date) as latest_date FROM daily_stock_data WHERE symbol_id = ?',
      [symbolId]
    );

    const result = (rows as any[])[0];
    return result.latest_date || null;
  }

  /**
   * Get all symbols
   */
  async getAllSymbols(): Promise<string[]> {
    const [rows] = await this.pool.execute('SELECT symbol FROM stock_symbols ORDER BY symbol');
    return (rows as any[]).map(row => row.symbol);
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
