#!/usr/bin/env node
/**
 * JJK Trading Labs Backend
 * Node.js/Express application for Moving Average trading analysis
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './controllers/auth.controller';
import emaRoutes from './controllers/ema.controller';
import optimizationRoutes from './controllers/optimization.controller';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { authMiddleware } from './middleware/auth.middleware';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '2222');

// CORS configuration (must be before other middleware)
app.use(cors({
  origin: [
    'http://localhost:1111', 
    'http://127.0.0.1:1111',
    'https://jjktradinglabs.com',
    'https://www.jjktradinglabs.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting - exclude OPTIONS requests from rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // More lenient in development
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => req.method === 'OPTIONS' // Don't rate limit preflight requests
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'JJK Trading Labs Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/ema', emaRoutes);
app.use('/api/optimization', optimizationRoutes);

// Trades routes
import tradesRoutes from './controllers/trades.controller';
app.use('/api/trades', tradesRoutes);

// Alerts routes
import { AlertsController } from './controllers/alerts.controller';
const alertsController = new AlertsController();
app.get('/api/alerts', authMiddleware, (req, res) => alertsController.getAlerts(req, res));
app.get('/api/alerts/stats', authMiddleware, (req, res) => alertsController.getSignalStats(req, res));
app.get('/api/alerts/symbol', authMiddleware, (req, res) => alertsController.getAlertsForSymbol(req, res));

// Discovery routes
import { DiscoveryController } from './controllers/discovery.controller';
const discoveryController = new DiscoveryController();
app.get('/api/discovery/stocks', authMiddleware, (req, res) => discoveryController.getDiscoveryStocks(req, res));
app.put('/api/discovery/preferences', authMiddleware, (req, res) => discoveryController.updateDiscoveryPreferences(req, res));

// Stock symbols management routes
import symbolsRoutes from './routes/symbols.routes';
app.use('/api/symbols/manage', symbolsRoutes);

// Symbols endpoint (no auth required)
app.get('/api/symbols', async (req, res) => {
  try {
    const { getDbConnection } = await import('./utils/database');
    const db = getDbConnection();
    
    const query = 'SELECT symbol FROM stock_symbols ORDER BY symbol';
    const [rows] = await db.execute(query);
    
    const symbols = (rows as any[]).map(row => row.symbol);
    
    res.json({
      success: true,
      symbols
    });
    return;
  } catch (error) {
    console.error('Error getting symbols:', error);
    res.status(500).json({ error: 'Failed to fetch symbols' });
  }
});

// Stock data endpoint (no auth required)
app.get('/api/stocks/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 365;
    const includeEma = req.query.include_ema === 'true';
    const maType = (req.query.ma_type as string) || 'ema';
    
    const { getDbConnection } = await import('./utils/database');
    const db = getDbConnection();
    
    let query: string;
    let params: any[];
    
    if (days > 0) {
      // Use string interpolation for LIMIT to avoid parameter binding issues
      query = `
        SELECT d.date, d.open, d.high, d.low, d.close, d.volume 
        FROM daily_stock_data d
        JOIN stock_symbols s ON d.symbol_id = s.id
        WHERE s.symbol = ? 
        ORDER BY d.date DESC 
        LIMIT ${days}
      `;
      params = [symbol.toUpperCase()];
    } else {
      query = `
        SELECT d.date, d.open, d.high, d.low, d.close, d.volume 
        FROM daily_stock_data d
        JOIN stock_symbols s ON d.symbol_id = s.id
        WHERE s.symbol = ? 
        ORDER BY d.date DESC
      `;
      params = [symbol.toUpperCase()];
    }
    
    const [rows] = await db.execute(query, params);
    
    if (!rows || (rows as any[]).length === 0) {
      return res.status(404).json({ error: `No data found for symbol ${symbol}` });
    }
    
    // Convert to proper format
    let data = (rows as any[]).map(row => ({
      date: row.date.toISOString().split('T')[0],
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseInt(row.volume)
    }));
    
    // Sort by date ascending for chart
    data = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Calculate Moving Averages if requested
    if (includeEma) {
      data = calculateMovingAverages(data, maType);
    }
    
    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      data
    });
    return;
    
  } catch (error) {
    console.error(`Error getting stock data for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Failed to fetch stock data' });
    return;
  }
});

// Helper function to calculate moving averages
function calculateMovingAverages(data: any[], maType: string) {
  const result = [...data];
  
  // Calculate 21-period MA
  for (let i = 20; i < result.length; i++) {
    if (maType === 'sma') {
      const sum21 = result.slice(i - 20, i + 1).reduce((sum, item) => sum + item.close, 0);
      result[i].ma_21 = sum21 / 21;
    } else { // EMA
      if (i === 20) {
        const sum21 = result.slice(0, 21).reduce((sum, item) => sum + item.close, 0);
        result[i].ma_21 = sum21 / 21;
      } else {
        const alpha = 2 / (21 + 1);
        result[i].ma_21 = alpha * result[i].close + (1 - alpha) * result[i - 1].ma_21;
      }
    }
  }
  
  // Calculate 50-period MA
  for (let i = 49; i < result.length; i++) {
    if (maType === 'sma') {
      const sum50 = result.slice(i - 49, i + 1).reduce((sum, item) => sum + item.close, 0);
      result[i].ma_50 = sum50 / 50;
    } else { // EMA
      if (i === 49) {
        const sum50 = result.slice(0, 50).reduce((sum, item) => sum + item.close, 0);
        result[i].ma_50 = sum50 / 50;
      } else {
        const alpha = 2 / (50 + 1);
        result[i].ma_50 = alpha * result[i].close + (1 - alpha) * result[i - 1].ma_50;
      }
    }
  }
  
  return result;
}

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  // Server started successfully
});

export default app;
