# Daily Stock Data Update - Cron Job Setup

This guide will help you set up a cron job to automatically update stock data every night.

## Prerequisites

1. The `daily-stock-update.sh` script must be executable (already done)
2. MySQL database must be running and accessible
3. Node.js and npm must be installed
4. All dependencies must be installed in `get_stock_data/` directory

## Quick Setup

### 1. Test the Script First

Before setting up the cron job, test the script manually:

```bash
cd /home/jeff/Projects/stocks/jjktradinglabs
./scripts/daily-stock-update.sh
```

Check the log file after it runs:
```bash
tail -f logs/daily-update-$(date +%Y-%m-%d).log
```

### 2. Set Up Cron Job

#### Option A: Run at 2 AM Local Time (Recommended)

Open your crontab:
```bash
crontab -e
```

Add this line to run at 2 AM every day:
```
0 2 * * * /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh
```

#### Option B: Run at 2 AM EST (Regardless of Local Timezone)

If you want to ensure it runs at 2 AM Eastern Time:

```bash
# For Eastern Standard Time (EST - Winter)
0 2 * * * TZ="America/New_York" /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh
```

#### Option C: Run at Specific Time in UTC

If your server is in UTC and you want 2 AM EST:
- EST is UTC-5, so 2 AM EST = 7 AM UTC
- EDT (daylight) is UTC-4, so 2 AM EDT = 6 AM UTC

For year-round 2 AM Eastern (adjusts for daylight saving):
```
0 2 * * * TZ="America/New_York" /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh
```

### 3. Verify Cron Job is Set

List your cron jobs:
```bash
crontab -l
```

### 4. Monitor the Cron Job

Check if cron is running:
```bash
sudo systemctl status cron
```

View system cron logs:
```bash
grep CRON /var/log/syslog | tail -20
```

View your update logs:
```bash
ls -lh /home/jeff/Projects/stocks/jjktradinglabs/logs/
tail -50 /home/jeff/Projects/stocks/jjktradinglabs/logs/daily-update-*.log
```

## Cron Schedule Syntax

```
* * * * * command
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, 0 and 7 are Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

### Examples:

- `0 2 * * *` - Every day at 2:00 AM
- `0 2 * * 1-5` - Every weekday at 2:00 AM (Monday-Friday)
- `30 1 * * *` - Every day at 1:30 AM
- `0 2 * * 0` - Every Sunday at 2:00 AM

## Troubleshooting

### Script doesn't run

1. Check cron daemon is running:
   ```bash
   sudo systemctl status cron
   ```

2. Check the script has execute permissions:
   ```bash
   ls -l /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh
   ```

3. Test the script manually:
   ```bash
   /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh
   ```

### No logs are created

1. Check if the logs directory exists:
   ```bash
   ls -ld /home/jeff/Projects/stocks/jjktradinglabs/logs/
   ```

2. Ensure the script can write to the logs directory:
   ```bash
   mkdir -p /home/jeff/Projects/stocks/jjktradinglabs/logs/
   chmod 755 /home/jeff/Projects/stocks/jjktradinglabs/logs/
   ```

### Database connection errors

1. Check if MySQL is running:
   ```bash
   sudo systemctl status mysql
   ```

2. Verify database credentials in `.env` file:
   ```bash
   cat /home/jeff/Projects/stocks/jjktradinglabs/backend/.env | grep MYSQL
   ```

3. Test database connection:
   ```bash
   mysql -u root -p -e "USE StockPxLabs; SELECT COUNT(*) FROM stock_symbols;"
   ```

### Node.js or npm not found

If cron can't find Node.js, specify the full path in the cron job:

```bash
0 2 * * * /usr/bin/env bash -c 'export PATH=/usr/local/bin:/usr/bin:/bin:$PATH && /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh'
```

## Log Retention

Logs are automatically cleaned up after 30 days. To change this, edit the script:

```bash
# In daily-stock-update.sh, change this line:
find "$LOG_DIR" -name "daily-update-*.log" -type f -mtime +30 -delete
#                                                           ^^
#                                                    Change this number
```

## Manual Execution

You can manually run the update anytime:

```bash
cd /home/jeff/Projects/stocks/jjktradinglabs
./scripts/daily-stock-update.sh
```

Or using npm directly:
```bash
cd /home/jeff/Projects/stocks/jjktradinglabs/get_stock_data
npm run update-daily
```

## Email Notifications (Optional)

To receive email notifications when the job runs, add `MAILTO` to your crontab:

```bash
crontab -e
```

Add at the top:
```
MAILTO=your-email@example.com

0 2 * * * /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh
```

Note: This requires mail system to be configured on your server.

## What the Script Does

1. Loads environment variables from `.env` file
2. Fetches the latest stock data for all symbols in the database
3. Updates the `daily_stock_data` table
4. Cleans up data older than 3 years
5. Logs all activity to dated log files
6. Automatically removes log files older than 30 days

## Schedule Recommendations

- **2 AM Local Time**: Best for most users
  - `0 2 * * *`
- **After Market Close**: If you want same-day data
  - `0 17 * * *` (5 PM - after US markets close at 4 PM ET)
- **Weekend Skip**: Only run on trading days
  - `0 2 * * 1-5` (Monday-Friday only)

Note: Yahoo Finance data is usually available after market close (4 PM ET), but may have delays.

