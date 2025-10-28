-- Migration: Add discovery preference fields to user_preferences table
-- Run this on existing databases to add the new discovery fields

USE StockPxLabs;

-- Add discovery preference columns
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS discovery_min_win_rate DECIMAL(5,2) DEFAULT 50.0 AFTER favorite_stocks,
ADD COLUMN IF NOT EXISTS discovery_min_return DECIMAL(5,2) DEFAULT 5.0 AFTER discovery_min_win_rate,
ADD COLUMN IF NOT EXISTS discovery_min_sharpe DECIMAL(5,2) DEFAULT 0.20 AFTER discovery_min_return,
ADD COLUMN IF NOT EXISTS discovery_min_trades INT DEFAULT 3 AFTER discovery_min_sharpe,
ADD COLUMN IF NOT EXISTS discovery_max_stocks INT DEFAULT 15 AFTER discovery_min_trades;

-- Verify the columns were added
DESCRIBE user_preferences;

