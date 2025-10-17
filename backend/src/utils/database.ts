/**
 * Database connection and utility functions
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  waitForConnections: boolean;
  connectionLimit: number;
  queueLimit: number;
}

const config: DatabaseConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'StockPxLabs',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(config);

export class DatabaseService {
  private pool: mysql.Pool;

  constructor() {
    this.pool = pool;
  }

  /**
   * Execute a query with parameters
   */
  async execute(query: string, params: any[] = []): Promise<[any, mysql.FieldPacket[]]> {
    try {
      const connection = await this.pool.getConnection();
      try {
        const [rows, fields] = await connection.execute(query, params);
        return [rows, fields];
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async executeTransaction(queries: Array<{ query: string; params: any[] }>): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      
      for (const { query, params } of queries) {
        await connection.execute(query, params);
      }
      
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get a single connection (for special cases)
   */
  async getConnection(): Promise<mysql.PoolConnection> {
    return await this.pool.getConnection();
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Create singleton instance
const dbService = new DatabaseService();

/**
 * Get database connection (legacy compatibility)
 */
export function getDbConnection(): mysql.Pool {
  return pool;
}

/**
 * Get stock data from database
 */
export async function getStockData(symbol: string, days: number = 0): Promise<any[] | null> {
  try {
    // Robust type conversion
    let daysInt: number;
    if (typeof days === 'string') {
      daysInt = parseInt(days, 10);
    } else if (typeof days === 'number') {
      daysInt = Math.floor(days);
    } else {
      daysInt = 0;
    }
    
    // Ensure it's a valid number
    if (isNaN(daysInt)) {
      daysInt = 0;
    }
    
    console.log('getStockData called:', { 
      symbol, 
      daysOriginal: days, 
      daysInt, 
      typeOriginal: typeof days,
      typeInt: typeof daysInt,
      isNaN: isNaN(daysInt)
    });
    
    let query: string;
    let params: any[];

    if (daysInt > 0) {
      // Use string interpolation for LIMIT to avoid parameter binding issues
      query = `
        SELECT d.date, d.open, d.high, d.low, d.close, d.volume 
        FROM daily_stock_data d
        JOIN stock_symbols s ON d.symbol_id = s.id
        WHERE s.symbol = ? 
        ORDER BY d.date DESC 
        LIMIT ${daysInt}
      `;
      params = [symbol.toUpperCase()];
      console.log('Query with LIMIT interpolated, params:', params, 'limit:', daysInt);
    } else {
      query = `
        SELECT d.date, d.open, d.high, d.low, d.close, d.volume 
        FROM daily_stock_data d
        JOIN stock_symbols s ON d.symbol_id = s.id
        WHERE s.symbol = ? 
        ORDER BY d.date DESC
      `;
      params = [symbol.toUpperCase()];
      console.log('Query without LIMIT, params:', params);
    }

    const [rows] = await dbService.execute(query, params);
    
    if (!rows || (rows as any[]).length === 0) {
      return null;
    }

    // Convert to proper format and sort by date ascending
    const data = (rows as any[])
      .map(row => ({
        date: new Date(row.date),
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseInt(row.volume)
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return data;
  } catch (error) {
    console.error(`Error getting stock data for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get all available stock symbols
 */
export async function getStockSymbols(): Promise<string[]> {
  try {
    const query = 'SELECT symbol FROM stock_symbols ORDER BY symbol';
    const [rows] = await dbService.execute(query);
    
    return (rows as any[]).map(row => row.symbol);
  } catch (error) {
    console.error('Error getting stock symbols:', error);
    return [];
  }
}

export default dbService;
