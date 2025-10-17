/**
 * User Trades Controller
 * Manages real broker trades tracking
 */

import { Router, Request, Response } from 'express';
import dbService from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, createError } from '../middleware/error.middleware';

const router = Router();

/**
 * Get all user trades
 */
router.get('/', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const status = req.query.status as string; // 'open', 'closed', or undefined for all

  let query = `
    SELECT 
      id, symbol, entry_date, entry_price, shares,
      exit_date, exit_price, stop_loss, target_price,
      trade_notes, status, pnl, pnl_percent,
      created_at, updated_at
    FROM user_trades
    WHERE user_id = ?
  `;
  
  const params: any[] = [userId];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  query += ` ORDER BY entry_date DESC, created_at DESC`;

  const [trades] = await dbService.execute(query, params);

  res.json({
    success: true,
    trades
  });
}));

/**
 * Get single trade
 */
router.get('/:id', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tradeId = parseInt(req.params.id);

  const [trades] = await dbService.execute(
    'SELECT * FROM user_trades WHERE id = ? AND user_id = ?',
    [tradeId, userId]
  );

  if ((trades as any[]).length === 0) {
    throw createError('Trade not found', 404);
  }

  res.json({
    success: true,
    trade: (trades as any[])[0]
  });
}));

/**
 * Create new trade
 */
router.post('/', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const {
    symbol,
    entry_date,
    entry_price,
    shares,
    stop_loss,
    target_price,
    trade_notes
  } = req.body;

  // Validate required fields
  if (!symbol || !entry_date || !entry_price || !shares) {
    throw createError('Symbol, entry date, entry price, and shares are required', 400);
  }

  if (shares <= 0) {
    throw createError('Shares must be greater than 0', 400);
  }

  if (entry_price <= 0) {
    throw createError('Entry price must be greater than 0', 400);
  }

  // Format dates to YYYY-MM-DD
  const formatDate = (dateStr: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  };

  // Helper to convert empty string to null for numeric fields
  const toNumericOrNull = (value: any) => {
    if (value === '' || value === null || value === undefined) return null;
    return parseFloat(value);
  };

  const query = `
    INSERT INTO user_trades 
    (user_id, symbol, entry_date, entry_price, shares, stop_loss, target_price, trade_notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `;

  const [result] = await dbService.execute(query, [
    userId,
    symbol.toUpperCase(),
    formatDate(entry_date),
    entry_price,
    shares,
    toNumericOrNull(stop_loss),
    toNumericOrNull(target_price),
    trade_notes || null
  ]);

  res.json({
    success: true,
    message: 'Trade added successfully',
    trade_id: (result as any).insertId
  });
}));

/**
 * Update trade
 */
router.put('/:id', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tradeId = parseInt(req.params.id);
  const {
    symbol,
    entry_date,
    entry_price,
    shares,
    exit_date,
    exit_price,
    stop_loss,
    target_price,
    trade_notes,
    status
  } = req.body;

  // Verify trade belongs to user
  const [existing] = await dbService.execute(
    'SELECT id, entry_price, shares FROM user_trades WHERE id = ? AND user_id = ?',
    [tradeId, userId]
  );

  if ((existing as any[]).length === 0) {
    throw createError('Trade not found', 404);
  }

  const existingTrade = (existing as any[])[0];

  // Format dates to YYYY-MM-DD
  const formatDate = (dateStr: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  };

  // Calculate P&L if closing trade
  let pnl = null;
  let pnlPercent = null;
  let tradeStatus = status || 'open';

  if (exit_price && exit_date) {
    const actualEntryPrice = entry_price || existingTrade.entry_price;
    const actualShares = shares || existingTrade.shares;
    pnl = (exit_price - actualEntryPrice) * actualShares;
    pnlPercent = ((exit_price - actualEntryPrice) / actualEntryPrice) * 100;
    tradeStatus = 'closed';
  }

  const query = `
    UPDATE user_trades SET
      symbol = ?,
      entry_date = ?,
      entry_price = ?,
      shares = ?,
      exit_date = ?,
      exit_price = ?,
      stop_loss = ?,
      target_price = ?,
      trade_notes = ?,
      status = ?,
      pnl = ?,
      pnl_percent = ?
    WHERE id = ? AND user_id = ?
  `;

  // Helper to convert empty string to null for numeric fields
  const toNumericOrNull = (value: any) => {
    if (value === '' || value === null || value === undefined) return null;
    return parseFloat(value);
  };

  await dbService.execute(query, [
    symbol ? symbol.toUpperCase() : existingTrade.symbol,
    entry_date ? formatDate(entry_date) : existingTrade.entry_date,
    entry_price || existingTrade.entry_price,
    shares || existingTrade.shares,
    exit_date ? formatDate(exit_date) : null,
    toNumericOrNull(exit_price),
    toNumericOrNull(stop_loss),
    toNumericOrNull(target_price),
    trade_notes !== undefined ? (trade_notes || null) : null,
    tradeStatus,
    pnl,
    pnlPercent,
    tradeId,
    userId
  ]);

  res.json({
    success: true,
    message: 'Trade updated successfully'
  });
}));

/**
 * Delete trade
 */
router.delete('/:id', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tradeId = parseInt(req.params.id);

  const [result] = await dbService.execute(
    'DELETE FROM user_trades WHERE id = ? AND user_id = ?',
    [tradeId, userId]
  );

  if ((result as any).affectedRows === 0) {
    throw createError('Trade not found', 404);
  }

  res.json({
    success: true,
    message: 'Trade deleted successfully'
  });
}));

/**
 * Get trade statistics
 */
router.get('/stats/summary', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Open trades
  const [openTrades] = await dbService.execute(
    'SELECT COUNT(*) as count, SUM(shares * entry_price) as total_value FROM user_trades WHERE user_id = ? AND status = "open"',
    [userId]
  );

  // Closed trades stats
  const [closedStats] = await dbService.execute(
    `SELECT 
      COUNT(*) as total_trades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(pnl) as total_pnl,
      AVG(pnl_percent) as avg_return_pct
    FROM user_trades 
    WHERE user_id = ? AND status = "closed"`,
    [userId]
  );

  const openData = (openTrades as any[])[0];
  const closedData = (closedStats as any[])[0];

  res.json({
    success: true,
    stats: {
      open_trades: openData.count || 0,
      open_value: parseFloat(openData.total_value || 0),
      closed_trades: closedData.total_trades || 0,
      winning_trades: closedData.winning_trades || 0,
      win_rate: closedData.total_trades > 0 
        ? (closedData.winning_trades / closedData.total_trades * 100) 
        : 0,
      total_pnl: parseFloat(closedData.total_pnl || 0),
      avg_return_pct: parseFloat(closedData.avg_return_pct || 0)
    }
  });
}));

export default router;

