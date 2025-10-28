import { Request, Response } from 'express';
import { DatabaseService } from '../utils/database';

const db = new DatabaseService();

/**
 * Get all stock symbols with pagination and search
 */
export const getSymbols = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string) || '';
    
    // Validate limit and page are safe integers
    const limitNum = Math.max(1, Math.min(limit, 1000)); // Cap at 1000
    const pageNum = Math.max(1, page);
    const offset = (pageNum - 1) * limitNum;

    let countQuery = 'SELECT COUNT(*) as total FROM stock_symbols';
    let dataQuery = `
      SELECT 
        ss.id, 
        ss.symbol, 
        ss.company_name,
        MIN(dsd.date) as earliest_date,
        MAX(dsd.date) as latest_date,
        COUNT(DISTINCT dsd.date) as data_points
      FROM stock_symbols ss
      LEFT JOIN daily_stock_data dsd ON ss.id = dsd.symbol_id
    `;
    const params: any[] = [];

    // Add search filter if provided
    if (search) {
      const searchCondition = ' WHERE ss.symbol LIKE ? OR ss.company_name LIKE ?';
      countQuery += searchCondition;
      dataQuery += searchCondition;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    // Group by for the aggregate functions
    dataQuery += ` GROUP BY ss.id, ss.symbol, ss.company_name`;
    
    // Add sorting and pagination (use string interpolation for LIMIT/OFFSET)
    dataQuery += ` ORDER BY ss.symbol ASC LIMIT ${limitNum} OFFSET ${offset}`;

    // Execute queries
    const [countRows] = await db.execute(countQuery, params) as any[];
    const [symbolRows] = await db.execute(dataQuery, params) as any[];

    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      symbols: symbolRows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error: any) {
    console.error('Error fetching symbols:', error);
    res.status(500).json({ error: 'Failed to fetch stock symbols' });
  }
};

/**
 * Get a single stock symbol by ID
 */
export const getSymbolById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const query = 'SELECT id, symbol, company_name FROM stock_symbols WHERE id = ?';
    const [rows] = await db.execute(query, [id]) as any[];

    if (rows.length === 0) {
      res.status(404).json({ error: 'Symbol not found' });
      return;
    }

    res.json(rows[0]);
  } catch (error: any) {
    console.error('Error fetching symbol:', error);
    res.status(500).json({ error: 'Failed to fetch stock symbol' });
  }
};

/**
 * Create a new stock symbol
 */
export const createSymbol = async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol, company_name } = req.body;

    // Validate input
    if (!symbol || !company_name) {
      res.status(400).json({ error: 'Symbol and company name are required' });
      return;
    }

    // Check if symbol already exists
    const checkQuery = 'SELECT id FROM stock_symbols WHERE symbol = ?';
    const [existing] = await db.execute(checkQuery, [symbol.toUpperCase()]) as any[];

    if (existing.length > 0) {
      res.status(409).json({ error: 'Symbol already exists' });
      return;
    }

    // Insert new symbol
    const insertQuery = 'INSERT INTO stock_symbols (symbol, company_name) VALUES (?, ?)';
    const result = await db.execute(insertQuery, [symbol.toUpperCase(), company_name]) as any;

    res.status(201).json({
      id: result.insertId,
      symbol: symbol.toUpperCase(),
      company_name,
      message: 'Stock symbol created successfully'
    });
  } catch (error: any) {
    console.error('Error creating symbol:', error);
    res.status(500).json({ error: 'Failed to create stock symbol' });
  }
};

/**
 * Update an existing stock symbol
 */
export const updateSymbol = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { symbol, company_name } = req.body;

    // Validate input
    if (!symbol || !company_name) {
      res.status(400).json({ error: 'Symbol and company name are required' });
      return;
    }

    // Check if symbol exists
    const checkQuery = 'SELECT id FROM stock_symbols WHERE id = ?';
    const [existingRows] = await db.execute(checkQuery, [id]) as any[];

    if (existingRows.length === 0) {
      res.status(404).json({ error: 'Symbol not found' });
      return;
    }

    // Check if new symbol conflicts with another record
    const conflictQuery = 'SELECT id FROM stock_symbols WHERE symbol = ? AND id != ?';
    const [conflictRows] = await db.execute(conflictQuery, [symbol.toUpperCase(), id]) as any[];

    if (conflictRows.length > 0) {
      res.status(409).json({ error: 'Symbol already exists' });
      return;
    }

    // Update symbol
    const updateQuery = 'UPDATE stock_symbols SET symbol = ?, company_name = ? WHERE id = ?';
    await db.execute(updateQuery, [symbol.toUpperCase(), company_name, id]);

    res.json({
      id: parseInt(id),
      symbol: symbol.toUpperCase(),
      company_name,
      message: 'Stock symbol updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating symbol:', error);
    res.status(500).json({ error: 'Failed to update stock symbol' });
  }
};

/**
 * Get symbol usage information
 */
export const getSymbolUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if symbol exists
    const checkQuery = 'SELECT symbol FROM stock_symbols WHERE id = ?';
    const [existingRows] = await db.execute(checkQuery, [id]) as any[];

    if (existingRows.length === 0) {
      res.status(404).json({ error: 'Symbol not found' });
      return;
    }

    const symbolName = existingRows[0].symbol;

    // Check usage across different tables
    const stockDataQuery = 'SELECT COUNT(*) as count FROM daily_stock_data WHERE symbol_id = ?';
    const [stockDataRows] = await db.execute(stockDataQuery, [id]) as any[];

    const performanceQuery = 'SELECT COUNT(*) as count FROM stock_performance_metrics WHERE symbol_id = ?';
    const [performanceRows] = await db.execute(performanceQuery, [id]) as any[];

    const userTradesQuery = 'SELECT COUNT(*) as count FROM user_trades WHERE symbol = ?';
    const [userTradesRows] = await db.execute(userTradesQuery, [symbolName]) as any[];

    const favoritesQuery = `
      SELECT COUNT(*) as count 
      FROM user_preferences 
      WHERE JSON_CONTAINS(favorite_stocks, JSON_QUOTE(?))
    `;
    const [favoritesRows] = await db.execute(favoritesQuery, [symbolName]) as any[];

    res.json({
      symbol: symbolName,
      usage: {
        stockData: stockDataRows[0].count,
        performance: performanceRows[0].count,
        userTrades: userTradesRows[0].count,
        favorites: favoritesRows[0].count,
        hasUsage: stockDataRows[0].count > 0 || performanceRows[0].count > 0 || 
                  userTradesRows[0].count > 0 || favoritesRows[0].count > 0
      }
    });
  } catch (error: any) {
    console.error('Error checking symbol usage:', error);
    res.status(500).json({ error: 'Failed to check symbol usage' });
  }
};

/**
 * Delete a stock symbol
 */
export const deleteSymbol = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if symbol exists
    const checkQuery = 'SELECT symbol FROM stock_symbols WHERE id = ?';
    const [existingRows] = await db.execute(checkQuery, [id]) as any[];

    if (existingRows.length === 0) {
      res.status(404).json({ error: 'Symbol not found' });
      return;
    }

    const symbolName = existingRows[0].symbol;

    // Check usage across different tables
    const stockDataQuery = 'SELECT COUNT(*) as count FROM daily_stock_data WHERE symbol_id = ?';
    const [stockDataRows] = await db.execute(stockDataQuery, [id]) as any[];
    const stockDataCount = stockDataRows[0].count;

    const performanceQuery = 'SELECT COUNT(*) as count FROM stock_performance_metrics WHERE symbol_id = ?';
    const [performanceRows] = await db.execute(performanceQuery, [id]) as any[];
    const performanceCount = performanceRows[0].count;

    const userTradesQuery = 'SELECT COUNT(*) as count FROM user_trades WHERE symbol = ?';
    const [userTradesRows] = await db.execute(userTradesQuery, [symbolName]) as any[];
    const userTradesCount = userTradesRows[0].count;

    // Check favorites - JSON_CONTAINS requires MySQL 5.7+
    const favoritesQuery = `
      SELECT COUNT(*) as count 
      FROM user_preferences 
      WHERE JSON_CONTAINS(favorite_stocks, JSON_QUOTE(?))
    `;
    const [favoritesRows] = await db.execute(favoritesQuery, [symbolName]) as any[];
    const favoritesCount = favoritesRows[0].count;

    // Delete from user_trades (not cascaded since symbol is VARCHAR, not FK)
    if (userTradesCount > 0) {
      await db.execute('DELETE FROM user_trades WHERE symbol = ?', [symbolName]);
    }

    // Remove from favorites in user_preferences
    if (favoritesCount > 0) {
      const updateFavoritesQuery = `
        UPDATE user_preferences 
        SET favorite_stocks = JSON_REMOVE(
          favorite_stocks,
          REPLACE(JSON_SEARCH(favorite_stocks, 'one', ?), '"', '')
        )
        WHERE JSON_CONTAINS(favorite_stocks, JSON_QUOTE(?))
      `;
      await db.execute(updateFavoritesQuery, [symbolName, symbolName]);
    }

    // Delete symbol (CASCADE will automatically delete daily_stock_data and performance_metrics)
    const deleteQuery = 'DELETE FROM stock_symbols WHERE id = ?';
    await db.execute(deleteQuery, [id]);

    // Build informative message
    const deletedItems: string[] = [];
    if (stockDataCount > 0) deletedItems.push(`${stockDataCount} stock data records`);
    if (performanceCount > 0) deletedItems.push(`${performanceCount} performance metrics`);
    if (userTradesCount > 0) deletedItems.push(`${userTradesCount} user trades`);
    if (favoritesCount > 0) deletedItems.push(`removed from ${favoritesCount} user favorites`);

    const message = deletedItems.length > 0
      ? `Stock symbol deleted successfully (${deletedItems.join(', ')})`
      : 'Stock symbol deleted successfully';

    res.json({
      message,
      symbol: symbolName,
      usage: {
        stockData: stockDataCount,
        performance: performanceCount,
        userTrades: userTradesCount,
        favorites: favoritesCount
      }
    });
  } catch (error: any) {
    console.error('Error deleting symbol:', error);
    res.status(500).json({ error: 'Failed to delete stock symbol' });
  }
};

