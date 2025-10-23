#!/bin/bash

# JJK Trading Labs - Production Deployment Script
# Run this script on your Hostinger VPS

set -e  # Exit on any error

echo "🚀 Starting JJK Trading Labs Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/jjktradinglabs"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
NGINX_SITES="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"

echo -e "${YELLOW}📁 Setting up directories...${NC}"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

echo -e "${YELLOW}📥 Cloning repository...${NC}"
cd $APP_DIR
if [ -d ".git" ]; then
    echo "Repository exists, pulling latest changes..."
    git pull origin main
else
    echo "Cloning repository..."
    git clone https://github.com/yourusername/jjktradinglabs.git .
fi

echo -e "${YELLOW}🔧 Setting up backend...${NC}"
cd $BACKEND_DIR
npm install --production

# Copy production environment file
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp ../production.env.example .env
    echo -e "${RED}⚠️  IMPORTANT: Edit .env file with your production values!${NC}"
    echo "Run: nano $BACKEND_DIR/.env"
fi

echo -e "${YELLOW}🏗️  Building frontend...${NC}"
cd $FRONTEND_DIR
npm install
npm run build --prod

echo -e "${YELLOW}🗄️  Setting up database...${NC}"
cd $BACKEND_DIR
# Run database setup
mysql -u root -p < sql_queries.sql

echo -e "${YELLOW}🔄 Starting services with PM2...${NC}"
# Stop existing processes
pm2 stop jjk-trading-backend 2>/dev/null || true
pm2 delete jjk-trading-backend 2>/dev/null || true

# Start backend
cd $BACKEND_DIR
pm2 start src/app.ts --name "jjk-trading-backend" --interpreter ts-node
pm2 save
pm2 startup

echo -e "${YELLOW}🌐 Configuring Nginx...${NC}"
# Create Nginx configuration
sudo tee $NGINX_SITES/jjktradinglabs > /dev/null <<EOF
server {
    listen 80;
    server_name jjktradinglabs.com www.jjktradinglabs.com api.jjktradinglabs.com;

    # Frontend
    location / {
        root $FRONTEND_DIR/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:2222;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
EOF

# Enable site
sudo ln -sf $NGINX_SITES/jjktradinglabs $NGINX_ENABLED/
sudo nginx -t
sudo systemctl reload nginx

echo -e "${YELLOW}🔒 Setting up SSL with Let's Encrypt...${NC}"
sudo certbot --nginx -d jjktradinglabs.com -d www.jjktradinglabs.com -d api.jjktradinglabs.com

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 Your site should be available at: https://jjktradinglabs.com${NC}"
echo -e "${GREEN}🔧 API available at: https://api.jjktradinglabs.com${NC}"

echo -e "${YELLOW}📋 Next steps:${NC}"
echo "1. Edit $BACKEND_DIR/.env with your production values"
echo "2. Run: pm2 restart jjk-trading-backend"
echo "3. Check logs: pm2 logs jjk-trading-backend"
echo "4. Test your site: https://jjktradinglabs.com"
