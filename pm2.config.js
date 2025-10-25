module.exports = {
  apps: [
    {
      name: 'jjk-trading-backend',
      script: 'dist/app.js',
      cwd: '/var/www/jjk-trading-labs/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 2222,
        MYSQL_HOST: 'localhost',
        MYSQL_PORT: 3306,
        MYSQL_USER: 'root',
        MYSQL_PASSWORD: 'h@stRt2!6inger',
        MYSQL_DATABASE: 'StockPxLabs',
        JWT_SECRET: 'dc41ff61127f9b4072218eb9d8fcb42713e0d9a22232a6b9f9c10d11fd462e25b89921ffb03e5e06dfacb5930c5424441bff7eacab278603e866480e12329f34',
        JWT_EXPIRES_IN: '24h',
        FRONTEND_URL: 'https://jjktradinglabs.com'
      },
      error_file: '/var/log/pm2/jjk-trading-backend-error.log',
      out_file: '/var/log/pm2/jjk-trading-backend-out.log',
      log_file: '/var/log/pm2/jjk-trading-backend.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
