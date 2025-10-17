/**
 * Authentication Controller
 * Handles user registration, login, email verification, and profile management
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import dbService from '../utils/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { asyncHandler, createError } from '../middleware/error.middleware';

// Ensure environment variables are loaded
dotenv.config();

const router = Router();

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    email_verified: boolean;
    role: string;
  };
}

/**
 * Register a new user
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  // Validate input
  if (!email || !password || !name) {
    throw createError('Email, password, and name are required', 400);
  }

  if (password.length < 8) {
    throw createError('Password must be at least 8 characters long', 400);
  }

  // Check if user already exists
  const [existingUsers] = await dbService.execute(
    'SELECT id FROM users WHERE email = ?',
    [email.toLowerCase()]
  );

  if ((existingUsers as any[]).length > 0) {
    throw createError('User with this email already exists', 400);
  }

  // Hash password
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Insert user into database
  const [result] = await dbService.execute(
    `INSERT INTO users (email, password_hash, email_verified, verification_token) 
     VALUES (?, ?, FALSE, ?)`,
    [email.toLowerCase(), passwordHash, verificationToken]
  );

  const userId = (result as any).insertId;

  // Send verification email
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Verify your email - JJK Trading Labs',
    html: `
      <h2>Welcome to JJK Trading Labs!</h2>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verificationUrl}" style="background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
        Verify Email
      </a>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p>${verificationUrl}</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send verification email:', error);
    // Don't fail registration if email fails
  }

  res.status(201).json({
    success: true,
    message: 'User registered successfully. Please check your email to verify your account.',
    user_id: userId
  });
}));

/**
 * Login user
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw createError('Email and password are required', 400);
  }

    // Get user from database
    const [users] = await dbService.execute(
      'SELECT id, email, password_hash, email_verified, role_id FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

  if ((users as any[]).length === 0) {
    throw createError('Invalid email or password', 401);
  }

  const user = (users as any[])[0];

  // Check if email is verified
  if (!user.email_verified) {
    throw createError('Please verify your email before logging in', 401);
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw createError('Invalid email or password', 401);
  }

  // Generate JWT token
  const secret = process.env.JWT_SECRET || 'fallback-secret';
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    secret,
    { expiresIn: '24h' }
  );

  // Get user preferences
  const [preferences] = await dbService.execute(
    'SELECT * FROM user_preferences WHERE user_id = ?',
    [user.id]
  );

  let userPreferences = null;
  if ((preferences as any[]).length > 0) {
    userPreferences = (preferences as any[])[0];
  }

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: userPreferences?.name || user.email.split('@')[0], // Use email prefix as name
      email_verified: user.email_verified,
      role: user.role_id || 1,
      preferences: userPreferences
    }
  });
}));

/**
 * Verify email address
 */
router.post('/verify-email', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    throw createError('Verification token is required', 400);
  }

  // Find user with this token
  const [users] = await dbService.execute(
    'SELECT id, email FROM users WHERE verification_token = ? AND email_verified = FALSE',
    [token]
  );

  if ((users as any[]).length === 0) {
    throw createError('Invalid or expired verification token', 400);
  }

  const user = (users as any[])[0];

  // Update user as verified
  await dbService.execute(
    'UPDATE users SET email_verified = TRUE, verification_token = NULL WHERE id = ?',
    [user.id]
  );

  // Create default user preferences
  await dbService.execute(
    `INSERT INTO user_preferences (user_id, name, default_days, default_atr_period, default_atr_multiplier, 
     default_ma_type, default_initial_capital, position_sizing_percentage, mean_reversion_threshold, 
     trades_columns) 
     VALUES (?, ?, 365, 14, 2.0, 'ema', 100000, 5.0, 10.0, 
     '{"entry_date":true,"exit_date":true,"entry_price":true,"exit_price":true,"exit_reason":true,"shares":true,"pnl":true,"pnl_percent":true,"running_pnl":true,"running_capital":true,"drawdown":true,"duration":true}')`,
    [user.id, user.email]
  );

  res.json({
    success: true,
    message: 'Email verified successfully'
  });
}));

/**
 * Get current user profile
 */
router.get('/profile', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Get user details
  const [users] = await dbService.execute(
    'SELECT id, email, email_verified, role_id, created_at FROM users WHERE id = ?',
    [userId]
  );

  if ((users as any[]).length === 0) {
    throw createError('User not found', 404);
  }

  const user = (users as any[])[0];

  // Get user preferences
  const [preferences] = await dbService.execute(
    'SELECT * FROM user_preferences WHERE user_id = ?',
    [userId]
  );

  let userPreferences = null;
  if ((preferences as any[]).length > 0) {
    userPreferences = (preferences as any[])[0];
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: userPreferences?.name || user.email.split('@')[0],
      email_verified: user.email_verified,
      role: user.role_id || 1,
      created_at: user.created_at,
      preferences: userPreferences
    }
  });
}));

/**
 * Update user profile
 */
router.put('/profile', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { name, email } = req.body;

  if (!name && !email) {
    throw createError('Name or email is required', 400);
  }

  if (email) {
    // Check if email is already taken by another user
    const [existingUsers] = await dbService.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email.toLowerCase(), userId]
    );

    if ((existingUsers as any[]).length > 0) {
      throw createError('Email is already taken', 400);
    }

    await dbService.execute(
      'UPDATE users SET email = ? WHERE id = ?',
      [email.toLowerCase(), userId]
    );
  }

  if (name) {
    // Update name in user_preferences table
    await dbService.execute(
      'UPDATE user_preferences SET name = ? WHERE user_id = ?',
      [name, userId]
    );
  }

  res.json({
    success: true,
    message: 'Profile updated successfully'
  });
}));

/**
 * Update user preferences
 */
router.put('/preferences', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const preferences = req.body;

  // Update user preferences
  await dbService.execute(
    `UPDATE user_preferences SET 
     default_days = ?, 
     default_atr_period = ?, 
     default_atr_multiplier = ?, 
     default_ma_type = ?, 
     default_initial_capital = ?, 
     position_sizing_percentage = ?, 
     mean_reversion_threshold = ? 
     WHERE user_id = ?`,
    [
      preferences.default_days,
      preferences.default_atr_period,
      preferences.default_atr_multiplier,
      preferences.default_ma_type,
      preferences.default_initial_capital,
      preferences.position_sizing_percentage,
      preferences.mean_reversion_threshold,
      userId
    ]
  );

  res.json({
    success: true,
    message: 'Preferences updated successfully'
  });
}));

/**
 * Change password
 */
router.put('/change-password', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw createError('Current password and new password are required', 400);
  }

  if (newPassword.length < 8) {
    throw createError('New password must be at least 8 characters long', 400);
  }

  // Get current password hash
  const [users] = await dbService.execute(
    'SELECT password_hash FROM users WHERE id = ?',
    [userId]
  );

  if ((users as any[]).length === 0) {
    throw createError('User not found', 404);
  }

  const user = (users as any[])[0];

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValidPassword) {
    throw createError('Current password is incorrect', 400);
  }

  // Hash new password
  const saltRounds = 12;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await dbService.execute(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [newPasswordHash, userId]
  );

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

/**
 * Add stock to favorites
 */
router.post('/favorites/:symbol', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { symbol } = req.params;

  const [prefs] = await dbService.execute(
    'SELECT favorite_stocks FROM user_preferences WHERE user_id = ?',
    [userId]
  );

  if ((prefs as any[]).length === 0) {
    throw createError('User preferences not found', 404);
  }

  let favorites = (prefs as any[])[0].favorite_stocks || [];
  
  if (typeof favorites === 'string') {
    favorites = JSON.parse(favorites);
  }

  if (!Array.isArray(favorites)) {
    favorites = [];
  }

  const upperSymbol = symbol.toUpperCase();
  if (!favorites.includes(upperSymbol)) {
    favorites.push(upperSymbol);
  }

  await dbService.execute(
    'UPDATE user_preferences SET favorite_stocks = ? WHERE user_id = ?',
    [JSON.stringify(favorites), userId]
  );

  res.json({
    success: true,
    favorites
  });
}));

/**
 * Remove stock from favorites
 */
router.delete('/favorites/:symbol', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { symbol } = req.params;

  const [prefs] = await dbService.execute(
    'SELECT favorite_stocks FROM user_preferences WHERE user_id = ?',
    [userId]
  );

  if ((prefs as any[]).length === 0) {
    throw createError('User preferences not found', 404);
  }

  let favorites = (prefs as any[])[0].favorite_stocks || [];
  
  if (typeof favorites === 'string') {
    favorites = JSON.parse(favorites);
  }

  if (!Array.isArray(favorites)) {
    favorites = [];
  }

  const upperSymbol = symbol.toUpperCase();
  favorites = favorites.filter((s: string) => s !== upperSymbol);

  await dbService.execute(
    'UPDATE user_preferences SET favorite_stocks = ? WHERE user_id = ?',
    [JSON.stringify(favorites), userId]
  );

  res.json({
    success: true,
    favorites
  });
}));

/**
 * Get favorites
 */
router.get('/favorites', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const [prefs] = await dbService.execute(
    'SELECT favorite_stocks FROM user_preferences WHERE user_id = ?',
    [userId]
  );

  if ((prefs as any[]).length === 0) {
    throw createError('User preferences not found', 404);
  }

  let favorites = (prefs as any[])[0].favorite_stocks || [];
  
  if (typeof favorites === 'string') {
    favorites = JSON.parse(favorites);
  }

  res.json({
    success: true,
    favorites
  });
}));

/**
 * Get favorites with current market status
 */
router.get('/favorites-status', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const [prefs] = await dbService.execute(
    'SELECT favorite_stocks, default_atr_period, default_atr_multiplier, default_ma_type FROM user_preferences WHERE user_id = ?',
    [userId]
  );

  if ((prefs as any[]).length === 0) {
    throw createError('User preferences not found', 404);
  }

  let favorites = (prefs as any[])[0].favorite_stocks || [];
  
  if (typeof favorites === 'string') {
    favorites = JSON.parse(favorites);
  }

  if (!Array.isArray(favorites) || favorites.length === 0) {
    res.json({
      success: true,
      favorites_status: []
    });
    return;
  }

  const favoritesStatus = [];

  for (const symbol of favorites) {
    try {
      const query = `
        SELECT d.date, d.close
        FROM daily_stock_data d
        JOIN stock_symbols s ON d.symbol_id = s.id
        WHERE s.symbol = ?
        ORDER BY d.date DESC
        LIMIT 60
      `;
      
      const [rows] = await dbService.execute(query, [symbol.toUpperCase()]);
      
      if ((rows as any[]).length === 0) {
        continue;
      }

      const data = (rows as any[]).reverse();
      const latestData = data[data.length - 1];
      const latestClose = parseFloat(latestData.close);
      const latestDate = latestData.date;

      const closePrices = data.map((r: any) => parseFloat(r.close));
      const ma21 = calculateEMA(closePrices, 21);
      const ma50 = calculateEMA(closePrices, 50);
      
      const currentMA21 = ma21[ma21.length - 1];
      const currentMA50 = ma50[ma50.length - 1];

      let status = '';
      let statusColor = '';
      let actionable = false;
      let lastSignal = '';
      let lastSignalColor = '';

      const distanceFromMA21 = ((latestClose - currentMA21) / currentMA21) * 100;
      const distanceFromMA50 = ((latestClose - currentMA50) / currentMA50) * 100;

      if (latestClose > currentMA50 && latestClose > currentMA21) {
        if (currentMA21 > currentMA50) {
          status = 'In uptrend - Currently long';
          statusColor = 'success';
          lastSignal = 'BUY';
          lastSignalColor = 'buy';
          
          if (distanceFromMA21 > 10) {
            status = `In uptrend - Mean reversion alert (${distanceFromMA21.toFixed(1)}% above MA)`;
            statusColor = 'warning';
            lastSignal = 'MEAN REVERSION';
            lastSignalColor = 'alert';
            actionable = true;
          }
        } else {
          status = 'Above both MAs but 21 < 50 - Watch for trend confirmation';
          statusColor = 'neutral';
          lastSignal = 'WATCHING';
          lastSignalColor = 'neutral';
        }
      } else if (latestClose > currentMA50 && latestClose < currentMA21) {
        status = 'Between MAs - Watch for entry if price crosses above 21 MA';
        statusColor = 'neutral';
        lastSignal = 'WATCHING';
        lastSignalColor = 'neutral';
        actionable = true;
      } else if (latestClose < currentMA50 && latestClose < currentMA21) {
        status = 'Below both MAs - No position, watching for uptrend';
        statusColor = 'info';
        lastSignal = 'SELL';
        lastSignalColor = 'sell';
        actionable = true;
      } else {
        status = 'Between MAs - Monitoring';
        statusColor = 'neutral';
        lastSignal = 'WATCHING';
        lastSignalColor = 'neutral';
      }

      favoritesStatus.push({
        symbol: symbol.toUpperCase(),
        latest_price: latestClose,
        latest_date: latestDate,
        ma_21: currentMA21,
        ma_50: currentMA50,
        distance_from_ma21: distanceFromMA21,
        distance_from_ma50: distanceFromMA50,
        status,
        status_color: statusColor,
        last_signal: lastSignal,
        last_signal_color: lastSignalColor,
        actionable
      });

    } catch (error) {
      console.error(`Error getting status for ${symbol}:`, error);
    }
  }

  res.json({
    success: true,
    favorites_status: favoritesStatus
  });
}));

function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) {
    sum += data[i];
  }
  result[period - 1] = sum / period;
  
  for (let i = period; i < data.length; i++) {
    const ema = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    result[i] = ema;
  }
  
  return result;
}

export default router;
