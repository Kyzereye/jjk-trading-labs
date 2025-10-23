# 🚀 JJK Trading Labs - Hostinger VPS Deployment Guide

## 📋 Prerequisites
- [ ] Hostinger VPS with Ubuntu 20.04+
- [ ] Domain name pointing to VPS IP
- [ ] SSH access to VPS
- [ ] Git repository access

## 🔧 Step 1: Initial VPS Setup

### 1.1 Connect to VPS
```bash
ssh root@your-vps-ip
```

### 1.2 Update System
```bash
apt update && apt upgrade -y
```

### 1.3 Install Required Software
```bash
# Install essential packages
apt install -y curl wget git nginx mysql-server nodejs npm certbot python3-certbot-nginx

# Install Node.js 18+ (if needed)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2
```

## 🗄️ Step 2: Database Setup

### 2.1 Secure MySQL
```bash
mysql_secure_installation
```

### 2.2 Create Database and User
```bash
mysql -u root -p
```

```sql
CREATE DATABASE StockPxLabs;
CREATE USER 'trading_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON StockPxLabs.* TO 'trading_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 📁 Step 3: Deploy Application

### 3.1 Clone Repository
```bash
cd /var/www
git clone https://github.com/yourusername/jjktradinglabs.git
cd jjktradinglabs
```

### 3.2 Set Up Backend
```bash
cd backend
npm install --production

# Create production environment file
cp ../production.env.example .env
nano .env  # Edit with your production values
```

### 3.3 Set Up Frontend
```bash
cd ../frontend
npm install
npm run build --prod
```

### 3.4 Initialize Database
```bash
cd ../backend
mysql -u root -p StockPxLabs < sql_queries.sql
```

## 🔄 Step 4: Process Management

### 4.1 Start Backend with PM2
```bash
cd /var/www/jjktradinglabs/backend
pm2 start src/app.ts --name "jjk-trading-backend" --interpreter ts-node
pm2 save
pm2 startup
```

## 🌐 Step 5: Nginx Configuration

### 5.1 Create Nginx Config
```bash
cp /var/www/jjktradinglabs/nginx.conf /etc/nginx/sites-available/jjktradinglabs
ln -s /etc/nginx/sites-available/jjktradinglabs /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
```

### 5.2 Test and Reload Nginx
```bash
nginx -t
systemctl reload nginx
```

## 🔒 Step 6: SSL Certificate

### 6.1 Get Let's Encrypt Certificate
```bash
certbot --nginx -d jjktradinglabs.com -d www.jjktradinglabs.com -d api.jjktradinglabs.com
```

## ✅ Step 7: Verification

### 7.1 Check Services
```bash
# Check PM2 processes
pm2 status

# Check Nginx
systemctl status nginx

# Check MySQL
systemctl status mysql

# Check logs
pm2 logs jjk-trading-backend
```

### 7.2 Test URLs
- Frontend: https://jjktradinglabs.com
- API: https://api.jjktradinglabs.com/api/health

## 🔄 Step 8: Updates and Maintenance

### 8.1 Update Application
```bash
cd /var/www/jjktradinglabs
git pull origin main
cd backend && npm install --production
cd ../frontend && npm run build --prod
pm2 restart jjk-trading-backend
```

### 8.2 Monitor Logs
```bash
pm2 logs jjk-trading-backend --lines 100
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 🛠️ Troubleshooting

### Common Issues

1. **Port 2222 not accessible**
   ```bash
   ufw allow 2222
   ```

2. **Database connection issues**
   - Check MySQL service: `systemctl status mysql`
   - Verify credentials in `.env` file
   - Test connection: `mysql -u trading_user -p StockPxLabs`

3. **Frontend not loading**
   - Check Nginx config: `nginx -t`
   - Verify build files exist: `ls -la /var/www/jjktradinglabs/frontend/dist`

4. **PM2 process not starting**
   - Check logs: `pm2 logs jjk-trading-backend`
   - Restart: `pm2 restart jjk-trading-backend`

## 📊 Performance Optimization

### Database Optimization
```sql
-- Add indexes for better performance
ALTER TABLE daily_stock_data ADD INDEX idx_symbol_date (symbol, date);
ALTER TABLE user_trades ADD INDEX idx_user_id (user_id);
ALTER TABLE stock_performance_metrics ADD INDEX idx_symbol_strategy (symbol, strategy_mode);
```

### Nginx Optimization
- Enable gzip compression (already configured)
- Set up caching for static assets
- Configure rate limiting

## 🔐 Security Checklist

- [ ] Firewall configured (UFW)
- [ ] SSL certificate installed
- [ ] Database user has minimal privileges
- [ ] Environment variables secured
- [ ] Regular security updates
- [ ] Backup strategy in place

## 📈 Monitoring

### Set up monitoring
```bash
# Install monitoring tools
npm install -g pm2-logrotate
pm2 install pm2-logrotate
```

### Backup Database
```bash
# Create backup script
echo '#!/bin/bash
mysqldump -u root -p StockPxLabs > /var/backups/stockpxlabs_$(date +%Y%m%d_%H%M%S).sql' > /usr/local/bin/backup-db.sh
chmod +x /usr/local/bin/backup-db.sh

# Schedule daily backups
crontab -e
# Add: 0 2 * * * /usr/local/bin/backup-db.sh
```

---

## 🎉 Success!

Your JJK Trading Labs application should now be running at:
- **Frontend**: https://jjktradinglabs.com
- **API**: https://api.jjktradinglabs.com

For support or questions, check the logs and this guide!
