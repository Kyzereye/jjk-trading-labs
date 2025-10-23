module.exports = {
  apps: [
    {
      name: 'jjk-trading-backend',
      script: 'src/app.ts',
      interpreter: 'ts-node',
      cwd: '/var/www/jjktradinglabs/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 2222
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
