use StockPxLabs;
-- Drop tables if they exist (in correct order - child tables first, then parents)
DROP TABLE IF EXISTS user_trades;
DROP TABLE IF EXISTS user_usage;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS stock_performance_metrics;
DROP TABLE IF EXISTS trading_signals;
DROP TABLE IF EXISTS daily_stock_data;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS stock_symbols;
DROP TABLE IF EXISTS roles;

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_role_name (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default roles (ignore if they already exist)
INSERT IGNORE INTO roles (role_name, display_name, description) VALUES
('free', 'Free Tier', 'Basic access with limited features'),
('pro', 'Pro', 'Full access to all trading analysis features'),
('enterprise', 'Enterprise', 'Advanced features with priority support'),
('admin', 'Admin', 'Full system administration access');

-- Create stock_symbols table (no dependencies)
CREATE TABLE IF NOT EXISTS stock_symbols (
    id INT AUTO_INCREMENT PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    company_name VARCHAR(255),
    INDEX idx_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create users table (depends on roles)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255) NULL,
    verification_token_expires TIMESTAMP NULL,
    FOREIGN KEY (role_id) REFERENCES roles(id),
    INDEX idx_email (email),
    INDEX idx_active (is_active),
    INDEX idx_role_id (role_id),
    INDEX idx_verification_token (verification_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create user_preferences table (depends on users)
CREATE TABLE IF NOT EXISTS user_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    default_days INT DEFAULT 365,
    default_atr_period INT DEFAULT 14,
    default_fast_ma INT DEFAULT 21,
    default_slow_ma INT DEFAULT 50,
    default_ma_type VARCHAR(10) DEFAULT 'ema',
    default_initial_capital DECIMAL(15,2) DEFAULT 100000.00,
    mean_reversion_threshold DECIMAL(5,2) DEFAULT 10.0,
    position_sizing_long DECIMAL(5,2) DEFAULT 5.0,
    position_sizing_short DECIMAL(5,2) DEFAULT 3.0,
    atr_multiplier_long DECIMAL(3,1) DEFAULT 2.0,
    atr_multiplier_short DECIMAL(3,1) DEFAULT 1.5,
    trades_columns JSON,
    favorite_stocks JSON DEFAULT NULL,
    discovery_min_win_rate DECIMAL(5,2) DEFAULT 50.0,
    discovery_min_return DECIMAL(5,2) DEFAULT 5.0,
    discovery_min_sharpe DECIMAL(5,2) DEFAULT 0.20,
    discovery_min_trades INT DEFAULT 3,
    discovery_max_stocks INT DEFAULT 15,
    subscription_tier VARCHAR(20) DEFAULT 'basic',
    trial_ends_at DATETIME NULL,
    subscription_status ENUM('trial', 'active', 'cancelled', 'expired') DEFAULT 'trial',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_subscription_tier (subscription_tier),
    INDEX idx_subscription_status (subscription_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create daily_stock_data table (depends on stock_symbols)
CREATE TABLE IF NOT EXISTS daily_stock_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    symbol_id INT NOT NULL,
    date DATE NOT NULL,
    open DECIMAL(10,2),
    high DECIMAL(10,2),
    low DECIMAL(10,2),
    close DECIMAL(10,2),
    volume BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (symbol_id) REFERENCES stock_symbols(id) ON DELETE CASCADE,
    UNIQUE KEY unique_symbol_date (symbol_id, date),
    INDEX idx_symbol_id (symbol_id),
    INDEX idx_date (date),
    INDEX idx_symbol_date (symbol_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create stock_performance_metrics table (depends on stock_symbols)
CREATE TABLE IF NOT EXISTS stock_performance_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    symbol_id INT NOT NULL,
    analysis_date DATE NOT NULL,
    time_period VARCHAR(10) NOT NULL DEFAULT 'ALL',
    strategy_mode VARCHAR(10) NOT NULL DEFAULT 'long',
    total_return_pct DECIMAL(8,2),
    total_pnl DECIMAL(15,2),
    win_rate DECIMAL(5,2),
    total_trades INT,
    long_trades INT DEFAULT 0,
    short_trades INT DEFAULT 0,
    sharpe_ratio DECIMAL(8,2),
    analysis_params JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (symbol_id) REFERENCES stock_symbols(id) ON DELETE CASCADE,
    UNIQUE KEY unique_symbol_analysis (symbol_id, analysis_date, time_period, strategy_mode),
    INDEX idx_symbol_analysis_date (symbol_id, analysis_date),
    INDEX idx_analysis_date (analysis_date),
    INDEX idx_time_period (time_period),
    INDEX idx_strategy_mode (strategy_mode),
    INDEX idx_total_return (total_return_pct),
    INDEX idx_sharpe_ratio (sharpe_ratio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create user_usage table for tracking monthly quotas (depends on users)
CREATE TABLE IF NOT EXISTS user_usage (
    user_id INT NOT NULL,
    month DATE NOT NULL,
    trades_count INT DEFAULT 0,
    ema_analyses_count INT DEFAULT 0,
    ma_optimizations_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, month),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_month (month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create user_trades table (depends on users)
CREATE TABLE IF NOT EXISTS user_trades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    position_type ENUM('long', 'short') DEFAULT 'long',
    entry_date DATE NOT NULL,
    entry_price DECIMAL(10,2) NOT NULL,
    shares INT NOT NULL,
    exit_date DATE NULL,
    exit_price DECIMAL(10,2) NULL,
    stop_loss DECIMAL(10,2) NULL,
    target_price DECIMAL(10,2) NULL,
    trade_notes TEXT NULL,
    status ENUM('open', 'closed') DEFAULT 'open',
    pnl DECIMAL(15,2) NULL,
    pnl_percent DECIMAL(8,2) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_symbol (symbol),
    INDEX idx_status (status),
    INDEX idx_position_type (position_type),
    INDEX idx_entry_date (entry_date),
    INDEX idx_user_symbol (user_id, symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create trading_signals table for storing daily alerts
CREATE TABLE IF NOT EXISTS trading_signals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    symbol_id INT NOT NULL,
    signal_type ENUM('entry', 'exit', 'mean_reversion') NOT NULL,
    signal_direction ENUM('long', 'short') NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    ma21_value DECIMAL(10,2),
    ma50_value DECIMAL(10,2),
    deviation_percent DECIMAL(5,2),
    signal_date DATE NOT NULL,
    signal_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (symbol_id) REFERENCES stock_symbols(id) ON DELETE CASCADE,
    UNIQUE KEY unique_signal (symbol_id, signal_type, signal_direction, signal_date),
    INDEX idx_symbol_signal_date (symbol_id, signal_date),
    INDEX idx_signal_type (signal_type),
    INDEX idx_signal_date (signal_date),
    INDEX idx_signal_direction (signal_direction)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

