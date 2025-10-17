# JJK Trading Labs - MA Stock Trading System

A comprehensive Moving Average trading analysis system built with Angular and Node.js, featuring advanced trading strategies, optimization tools, and real-time data analysis.

## 🚀 Features

- **Moving Average Trading Analysis**: EMA and SMA strategies with customizable parameters
- **Advanced Optimization**: Find optimal MA pairs for maximum returns
- **Real-time Data**: Live stock data integration with yfinance
- **Interactive Charts**: Professional trading charts with signals and alerts
- **User Authentication**: Secure user management with email verification
- **Performance Analytics**: Comprehensive trading performance metrics
- **Responsive Design**: Modern, mobile-friendly interface

## 🏗️ Architecture

```
jjktradinglabs/
├── backend/          # Node.js/Express API server
├── frontend/         # Angular application
├── get_stock_data/   # Data fetching scripts
└── README.md
```

### Technology Stack

- **Backend**: Node.js, Express, TypeScript, MySQL
- **Frontend**: Angular 17, Angular Material, TypeScript
- **Database**: MySQL with connection pooling
- **Charts**: Lightweight Charts for professional trading visualization
- **Data Source**: Yahoo Finance API via yfinance

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 18+ and npm
- MySQL 8.0+
- Git

### 1. Clone the Repository

```bash
git clone <repository-url>
cd jjktradinglabs
```

### 2. Database Setup

Create a MySQL database and run the SQL schema:

```sql
-- Create database
CREATE DATABASE StockPxLabs;

-- Use the database
USE StockPxLabs;

-- Create tables (copy from ma-stock-trading-sys/sql_queries.sql)
-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- User preferences table
CREATE TABLE user_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255),
    default_days INT DEFAULT 365,
    default_atr_period INT DEFAULT 14,
    default_atr_multiplier DECIMAL(3,1) DEFAULT 2.0,
    default_ma_type ENUM('ema', 'sma') DEFAULT 'ema',
    default_initial_capital DECIMAL(15,2) DEFAULT 100000.00,
    position_sizing_percentage DECIMAL(5,2) DEFAULT 5.00,
    mean_reversion_threshold DECIMAL(5,2) DEFAULT 10.00,
    trades_columns JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Stock symbols table
CREATE TABLE stock_symbols (
    id INT AUTO_INCREMENT PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    company_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Daily stock data table
CREATE TABLE daily_stock_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    symbol_id INT NOT NULL,
    date DATE NOT NULL,
    open DECIMAL(10,2) NOT NULL,
    high DECIMAL(10,2) NOT NULL,
    low DECIMAL(10,2) NOT NULL,
    close DECIMAL(10,2) NOT NULL,
    volume BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (symbol_id) REFERENCES stock_symbols(id) ON DELETE CASCADE,
    UNIQUE KEY unique_symbol_date (symbol_id, date)
);
```

### 3. Environment Configuration

Create environment files:

**Backend** (`backend/.env`):
```env
SECRET_KEY=your-secret-key-here
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password_here
MYSQL_DATABASE=StockPxLabs
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_email_password
SMTP_FROM=your_email@example.com
SMTP_SECURE=true
FRONTEND_URL=http://localhost:1111
JWT_SECRET=your-jwt-secret-key-here
JWT_EXPIRES_IN=24h
PORT=2222
NODE_ENV=development
```

**Data Scripts** (`get_stock_data/.env`):
```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password_here
MYSQL_DATABASE=StockPxLabs
```

### 4. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install

# Data Scripts
cd ../get_stock_data
npm install
```

### 5. Build and Start

```bash
# Build backend
cd backend
npm run build

# Start backend (Terminal 1)
npm start

# Start frontend (Terminal 2)
cd frontend
npm start

# Fetch initial data (Terminal 3)
cd get_stock_data
npm run fetch-3year
```

## 🎯 Usage

### 1. Access the Application

- **Frontend**: http://localhost:1111
- **Backend API**: http://localhost:2222
- **Health Check**: http://localhost:2222/api/health

### 2. User Registration

1. Navigate to the registration page
2. Create an account with email verification
3. Verify your email address
4. Login to access the trading dashboard

### 3. Trading Analysis

1. **Select a Stock**: Choose from available symbols
2. **Configure Parameters**: Set MA type, ATR multiplier, etc.
3. **Run Analysis**: Execute the trading strategy
4. **Review Results**: Analyze performance metrics and trades
5. **View Charts**: Interactive charts with buy/sell signals

### 4. Data Management

```bash
# Fetch 3 years of historical data
cd get_stock_data
npm run fetch-3year

# Update with latest daily data
npm run update-daily

# Expand historical data for specific symbols
npm run expand-historical
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-email` - Email verification
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/preferences` - Update preferences

### Trading Analysis
- `POST /api/ema/analyze` - Run EMA analysis
- `GET /api/ema/signals/:symbol` - Get trading signals
- `GET /api/ema/summary/:symbol` - Get analysis summary
- `GET /api/stocks/:symbol` - Get stock data

### Optimization
- `GET /api/optimization/optimize/:symbol` - Optimize MA pairs
- `GET /api/optimization/compare-pairs/:symbol` - Compare specific pairs
- `GET /api/optimization/heatmap/:symbol` - Generate heatmap data

## 🔧 Development

### Backend Development

```bash
cd backend
npm run dev  # Start with nodemon for auto-reload
```

### Frontend Development

```bash
cd frontend
npm start  # Angular dev server with hot reload
```

### Database Management

```bash
# Connect to MySQL
mysql -u root -p StockPxLabs

# View tables
SHOW TABLES;

# Check data
SELECT COUNT(*) FROM daily_stock_data;
SELECT COUNT(*) FROM stock_symbols;
```

## 📈 Trading Strategy

The system implements a sophisticated Moving Average trading strategy:

1. **Entry Signal**: Price closes above 50-period MA
2. **Exit Signal**: Price closes below 21-period MA
3. **Re-entry Logic**: Price closes above 21-period MA after exit
4. **Risk Management**: ATR-based trailing stops
5. **Mean Reversion Alerts**: Overbought conditions

### Key Features

- **Adaptive Re-entry**: Automatic re-entry when trend resumes
- **Trailing Stops**: Dynamic stop-loss based on ATR
- **Position Sizing**: Configurable position sizing percentage
- **Performance Metrics**: Comprehensive analytics and reporting

## 🚀 Production Deployment

### Backend Deployment

```bash
cd backend
npm run build
NODE_ENV=production npm start
```

### Frontend Deployment

```bash
cd frontend
npm run build:prod
# Deploy dist/ folder to your web server
```

### Environment Variables

Ensure all production environment variables are properly configured:
- Database credentials
- JWT secrets
- SMTP settings
- CORS origins

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API endpoints

## 🔄 Migration from Flask/React

This system is a complete migration from the original Flask/React implementation with:
- ✅ Same functionality and features
- ✅ Same database structure
- ✅ Same ports (Backend: 2222, Frontend: 1111)
- ✅ Enhanced performance and scalability
- ✅ Modern TypeScript architecture
- ✅ Improved error handling and logging
# jjk-trading-labs
# jjk-trading-labs
# jjk-trading-labs
# jjk-trading-labs
