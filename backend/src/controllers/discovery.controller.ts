import { Response } from 'express';
import { getDbConnection } from '../utils/database';
import { AuthRequest } from '../middleware/auth.middleware';

export class DiscoveryController {
  
  /**
   * Get discovery stocks based on user preferences
   */
  async getDiscoveryStocks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
        return;
      }

      // Get user's discovery preferences and favorites
      const [prefRows] = await getDbConnection().execute(
        `SELECT 
          discovery_min_win_rate,
          discovery_min_return,
          discovery_min_sharpe,
          discovery_min_trades,
          discovery_max_stocks,
          favorite_stocks
        FROM user_preferences 
        WHERE user_id = ?`,
        [userId]
      );

      const prefs = (prefRows as any[])[0];
      
      if (!prefs) {
        res.status(404).json({
          success: false,
          message: 'User preferences not found'
        });
        return;
      }

      // Parse favorites - handle both JSON array and comma-separated string formats
      let favoriteSymbols: string[] = [];
      
      if (prefs.favorite_stocks) {
        // Convert to string first (in case it's a Buffer or other type)
        const favoritesStr = String(prefs.favorite_stocks);
        
        try {
          // Try parsing as JSON first
          const favorites = JSON.parse(favoritesStr);
          
          if (Array.isArray(favorites)) {
            // If it's an array of objects with symbol property
            if (favorites.length > 0 && typeof favorites[0] === 'object' && favorites[0].symbol) {
              favoriteSymbols = favorites.map((f: any) => f.symbol.toUpperCase());
            } 
            // If it's an array of strings
            else {
              favoriteSymbols = favorites.map((s: string) => s.toUpperCase());
            }
          }
        } catch (e) {
          // If JSON parse fails, treat as comma-separated string
          favoriteSymbols = favoritesStr
            .split(',')
            .map((s: string) => s.trim().toUpperCase())
            .filter((s: string) => s.length > 0);
        }
      }

      // Build query conditionally based on whether there are favorites
      // Only include stocks that have recent trading signals (last 14 days)
      let query = `
        SELECT 
          ss.symbol,
          ss.company_name,
          spm.total_return_pct,
          spm.win_rate,
          spm.total_trades,
          spm.sharpe_ratio,
          spm.analysis_date
        FROM stock_performance_metrics spm
        JOIN stock_symbols ss ON spm.symbol_id = ss.id
        WHERE spm.win_rate >= ?
          AND spm.total_return_pct >= ?
          AND spm.sharpe_ratio >= ?
          AND spm.total_trades >= ?
          AND spm.analysis_date = (SELECT MAX(analysis_date) FROM stock_performance_metrics)
          AND EXISTS (
            SELECT 1 FROM trading_signals ts 
            WHERE ts.symbol_id = ss.id 
            AND ts.signal_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
          )
      `;

      const params: any[] = [
        parseFloat(prefs.discovery_min_win_rate) || 50.0,
        parseFloat(prefs.discovery_min_return) || 5.0,
        parseFloat(prefs.discovery_min_sharpe) || 0.20,
        parseInt(prefs.discovery_min_trades) || 3
      ];

      // Add NOT IN clause if there are favorites
      if (favoriteSymbols.length > 0) {
        const placeholders = favoriteSymbols.map(() => '?').join(',');
        query += ` AND ss.symbol NOT IN (${placeholders})`;
        params.push(...favoriteSymbols);
      }

      const maxStocks = parseInt(prefs.discovery_max_stocks) || 15;
      
      query += `
        ORDER BY (spm.win_rate * spm.total_return_pct * spm.sharpe_ratio) DESC
        LIMIT ${maxStocks}
      `;

      const [rows] = await getDbConnection().execute(query, params);
      
      const stocks = (rows as any[]).map(row => ({
        symbol: row.symbol,
        companyName: row.company_name,
        totalReturn: parseFloat(row.total_return_pct),
        winRate: parseFloat(row.win_rate),
        totalTrades: row.total_trades,
        sharpeRatio: parseFloat(row.sharpe_ratio),
        analysisDate: row.analysis_date
      }));

      res.json({
        success: true,
        data: stocks,
        criteria: {
          minWinRate: prefs.discovery_min_win_rate,
          minReturn: prefs.discovery_min_return,
          minSharpe: prefs.discovery_min_sharpe,
          minTrades: prefs.discovery_min_trades,
          maxStocks: prefs.discovery_max_stocks
        },
        count: stocks.length
      });

    } catch (error) {
      console.error('Error fetching discovery stocks:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch discovery stocks'
      });
    }
  }

  /**
   * Update user's discovery preferences
   */
  async updateDiscoveryPreferences(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
        return;
      }

      const {
        minWinRate,
        minReturn,
        minSharpe,
        minTrades,
        maxStocks
      } = req.body;

      // Validate inputs
      if (minWinRate !== undefined && (minWinRate < 0 || minWinRate > 100)) {
        res.status(400).json({
          success: false,
          message: 'Min win rate must be between 0 and 100'
        });
        return;
      }

      if (minSharpe !== undefined && minSharpe < 0) {
        res.status(400).json({
          success: false,
          message: 'Min Sharpe ratio must be positive'
        });
        return;
      }

      if (minTrades !== undefined && minTrades < 1) {
        res.status(400).json({
          success: false,
          message: 'Min trades must be at least 1'
        });
        return;
      }

      if (maxStocks !== undefined && (maxStocks < 1 || maxStocks > 50)) {
        res.status(400).json({
          success: false,
          message: 'Max stocks must be between 1 and 50'
        });
        return;
      }

      // Build update query dynamically based on provided fields
      const updates: string[] = [];
      const params: any[] = [];

      if (minWinRate !== undefined) {
        updates.push('discovery_min_win_rate = ?');
        params.push(minWinRate);
      }
      if (minReturn !== undefined) {
        updates.push('discovery_min_return = ?');
        params.push(minReturn);
      }
      if (minSharpe !== undefined) {
        updates.push('discovery_min_sharpe = ?');
        params.push(minSharpe);
      }
      if (minTrades !== undefined) {
        updates.push('discovery_min_trades = ?');
        params.push(minTrades);
      }
      if (maxStocks !== undefined) {
        updates.push('discovery_max_stocks = ?');
        params.push(maxStocks);
      }

      if (updates.length === 0) {
        res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
        return;
      }

      params.push(userId);

      const query = `
        UPDATE user_preferences 
        SET ${updates.join(', ')}
        WHERE user_id = ?
      `;

      await getDbConnection().execute(query, params);

      res.json({
        success: true,
        message: 'Discovery preferences updated successfully'
      });

    } catch (error) {
      console.error('Error updating discovery preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update discovery preferences'
      });
    }
  }
}

