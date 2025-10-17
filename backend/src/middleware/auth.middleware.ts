/**
 * Authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dbService from '../utils/database';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    email_verified: boolean;
    role: string;
  };
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
    
    // Get user from database
    const query = 'SELECT id, email, email_verified, role_id FROM users WHERE id = ?';
    const [rows] = await dbService.execute(query, [decoded.userId]);
    
    if (!rows || (rows as any[]).length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = (rows as any[])[0];
    
    // Check if email is verified
    if (!user.email_verified) {
      return res.status(401).json({ error: 'Email not verified' });
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      name: user.email.split('@')[0], // Use email prefix as name
      email_verified: user.email_verified,
      role: user.role_id || 1
    };

    next();
    return;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const optionalAuthMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next(); // Continue without authentication
    }

    // Try to verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
    
    // Get user from database
    const query = 'SELECT id, email, email_verified, role_id FROM users WHERE id = ?';
    const [rows] = await dbService.execute(query, [decoded.userId]);
    
    if (rows && (rows as any[]).length > 0) {
      const user = (rows as any[])[0];
      
      if (user.email_verified) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.email.split('@')[0], // Use email prefix as name
          email_verified: user.email_verified,
          role: user.role_id || 1
        };
      }
    }

    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};
