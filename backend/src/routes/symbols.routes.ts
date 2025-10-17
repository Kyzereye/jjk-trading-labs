import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getSymbols,
  getSymbolById,
  getSymbolUsage,
  createSymbol,
  updateSymbol,
  deleteSymbol
} from '../controllers/symbols.controller';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get all symbols (with pagination and search)
router.get('/', getSymbols);

// Get symbol usage info (must come before /:id route)
router.get('/:id/usage', getSymbolUsage);

// Get single symbol by ID
router.get('/:id', getSymbolById);

// Create new symbol
router.post('/', createSymbol);

// Update symbol
router.put('/:id', updateSymbol);

// Delete symbol
router.delete('/:id', deleteSymbol);

export default router;

