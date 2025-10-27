import { Request, Response } from 'express';
import { getDbConnection } from '../utils/database';

export class AlertsController {
  
  /**
   * Get trading signals/alerts for the dashboard
   */
  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const { period = '3days' } = req.query;
      
      // Determine how many trading days to look back
      let tradingDaysBack: number;
      switch (period) {
        case '3days':
          tradingDaysBack = 3;
          break;
        case 'week':
          tradingDaysBack = 7;
          break;
        case '10days':
          tradingDaysBack = 10;
          break;
        case '2weeks':
          tradingDaysBack = 14;
          break;
        default:
          tradingDaysBack = 3;
      }

      // First, get the actual trading days (dates that have signals in the database)
      const tradingDaysQuery = `
        SELECT DISTINCT signal_date
        FROM trading_signals
        ORDER BY signal_date DESC
        LIMIT ${tradingDaysBack}
      `;
      
      const [tradingDaysRows] = await getDbConnection().execute(tradingDaysQuery);
      const tradingDays = (tradingDaysRows as any[]).map(row => row.signal_date);
      
      if (tradingDays.length === 0) {
        res.json({
          success: true,
          data: [],
          period,
          count: 0
        });
        return;
      }
      
      // Build the query with IN clause for specific dates
      const placeholders = tradingDays.map(() => '?').join(',');
      const query = `
        SELECT 
          ts.id,
          ss.symbol,
          ts.signal_type,
          ts.signal_direction,
          ts.price,
          ts.ma21_value,
          ts.ma50_value,
          ts.deviation_percent,
          ts.signal_date,
          ts.signal_time,
          ts.created_at
        FROM trading_signals ts
        JOIN stock_symbols ss ON ts.symbol_id = ss.id
        WHERE ts.signal_date IN (${placeholders})
        ORDER BY ts.signal_date DESC, ts.signal_time DESC
      `;

      const [rows] = await getDbConnection().execute(query, tradingDays);
      
      const rowsArray = rows as any[];
      
      const alerts = rowsArray.map(row => ({
        id: row.id,
        symbol: row.symbol,
        signalType: row.signal_type,
        signalDirection: row.signal_direction,
        price: parseFloat(row.price),
        ma21Value: row.ma21_value ? parseFloat(row.ma21_value) : null,
        ma50Value: row.ma50_value ? parseFloat(row.ma50_value) : null,
        deviationPercent: row.deviation_percent ? parseFloat(row.deviation_percent) : null,
        signalDate: row.signal_date,
        signalTime: row.signal_time,
        createdAt: row.created_at
      }));

      res.json({
        success: true,
        data: alerts,
        period,
        count: alerts.length
      });

    } catch (error) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch alerts'
      });
    }
  }

  /**
   * Get signal statistics for the dashboard
   */
  async getSignalStats(req: Request, res: Response): Promise<void> {
    try {
      const { period = '3days' } = req.query;
      
      // Determine how many trading days to look back
      let tradingDaysBack: number;
      switch (period) {
        case '3days':
          tradingDaysBack = 3;
          break;
        case 'week':
          tradingDaysBack = 7;
          break;
        case '10days':
          tradingDaysBack = 10;
          break;
        case '2weeks':
          tradingDaysBack = 14;
          break;
        default:
          tradingDaysBack = 3;
      }

      // Get the actual trading days (dates that have signals in the database)
      const tradingDaysQuery = `
        SELECT DISTINCT signal_date
        FROM trading_signals
        ORDER BY signal_date DESC
        LIMIT ${tradingDaysBack}
      `;
      
      const [tradingDaysRows] = await getDbConnection().execute(tradingDaysQuery);
      const tradingDays = (tradingDaysRows as any[]).map(row => row.signal_date);
      
      if (tradingDays.length === 0) {
        res.json({
          success: true,
          data: {},
          period
        });
        return;
      }
      
      // Build the query with IN clause for specific dates
      const placeholders = tradingDays.map(() => '?').join(',');
      const query = `
        SELECT 
          signal_type,
          signal_direction,
          COUNT(*) as count
        FROM trading_signals ts
        WHERE ts.signal_date IN (${placeholders})
        GROUP BY signal_type, signal_direction
        ORDER BY signal_type, signal_direction
      `;

      const [rows] = await getDbConnection().execute(query, tradingDays);
      
      const stats = (rows as any[]).reduce((acc, row) => {
        const key = `${row.signal_type}_${row.signal_direction}`;
        acc[key] = parseInt(row.count);
        return acc;
      }, {});

      res.json({
        success: true,
        data: stats,
        period
      });

    } catch (error) {
      console.error('Error fetching signal stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch signal statistics'
      });
    }
  }

  /**
   * Get all alerts for a specific symbol (no time limit)
   */
  async getAlertsForSymbol(req: Request, res: Response): Promise<void> {
    try {
      const { symbol } = req.query;
      
      if (!symbol) {
        res.status(400).json({
          success: false,
          message: 'Symbol parameter is required'
        });
        return;
      }

      const query = `
        SELECT 
          ts.id,
          ss.symbol,
          ts.signal_type,
          ts.signal_direction,
          ts.price,
          ts.ma21_value,
          ts.ma50_value,
          ts.deviation_percent,
          ts.signal_date,
          ts.signal_time,
          ts.created_at
        FROM trading_signals ts
        JOIN stock_symbols ss ON ts.symbol_id = ss.id
        WHERE ss.symbol = ?
        ORDER BY ts.signal_date DESC, ts.signal_time DESC
        LIMIT 50
      `;

      const [rows] = await getDbConnection().execute(query, [symbol]);
      
      const alerts = (rows as any[]).map(row => ({
        id: row.id,
        symbol: row.symbol,
        signalType: row.signal_type,
        signalDirection: row.signal_direction,
        price: parseFloat(row.price),
        ma21Value: row.ma21_value ? parseFloat(row.ma21_value) : null,
        ma50Value: row.ma50_value ? parseFloat(row.ma50_value) : null,
        deviationPercent: row.deviation_percent ? parseFloat(row.deviation_percent) : null,
        signalDate: row.signal_date,
        signalTime: row.signal_time,
        createdAt: row.created_at
      }));

      res.json({
        success: true,
        data: alerts,
        symbol,
        count: alerts.length
      });

    } catch (error) {
      console.error('Error fetching alerts for symbol:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch alerts for symbol'
      });
    }
  }
}
