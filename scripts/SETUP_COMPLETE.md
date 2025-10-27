# Daily Stock Update - Setup Complete ✅

## Test Results

The daily stock update script has been tested and is working correctly:

- ✅ Script created: `scripts/daily-stock-update.sh`
- ✅ Script is executable
- ✅ Logs directory created: `logs/`
- ✅ Successfully updated 798 symbols
- ✅ All records saved to database
- ✅ Log file created with full output
- ✅ Old data cleanup working (3-year retention)

## Quick Setup: Add to Crontab

To run the update every night at 2 AM:

```bash
crontab -e
```

Add this line:
```
0 2 * * * /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh
```

Save and exit. Done!

## Next Steps

After setting up the cron job, you should also:

### 1. Run Trading Analysis After Data Update

The current script only updates stock data. To generate trading signals, you need to also run the analysis.

**Option A: Add to the same shell script**

Edit `scripts/daily-stock-update.sh` and add analysis after the update:
```bash
# After the update-stock-data runs...
echo "Running trading analysis..." >> "$LOG_FILE"
cd "$PROJECT_ROOT/get_stock_data"
npm run fetch-3years >> "$LOG_FILE" 2>&1
```

**Option B: Separate cron job** (Recommended)

Run analysis a few minutes after data update:
```
# Update data at 2:00 AM
0 2 * * * /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh

# Run analysis at 2:30 AM (after data is updated)
30 2 * * * cd /home/jeff/Projects/stocks/jjktradinglabs/get_stock_data && npm run fetch-3years >> /home/jeff/Projects/stocks/jjktradinglabs/logs/analysis-$(date +\%Y-\%m-\%d).log 2>&1
```

### 2. Monitor for a Few Days

Check the logs for the first few days to ensure everything is working:

```bash
# View today's log
tail -f ~/Projects/stocks/jjktradinglabs/logs/daily-update-$(date +%Y-%m-%d).log

# List all logs
ls -lh ~/Projects/stocks/jjktradinglabs/logs/

# Check if cron ran
grep CRON /var/log/syslog | grep daily-stock-update
```

### 3. Set Up Alerts (Optional)

Consider setting up email notifications if the job fails:

```bash
# In crontab, add MAILTO at the top
MAILTO=your-email@example.com

0 2 * * * /home/jeff/Projects/stocks/jjktradinglabs/scripts/daily-stock-update.sh || echo "Daily stock update failed!"
```

## What Happens Each Night

1. **2:00 AM** - Script runs automatically
2. Connects to database and gets all symbols
3. For each symbol:
   - Checks the latest date in database
   - Fetches any missing data from Yahoo Finance
   - Stores new data in `daily_stock_data` table
   - Appends to CSV backup file
4. Cleans up data older than 3 years
5. Logs everything to `logs/daily-update-YYYY-MM-DD.log`
6. Keeps only last 30 days of logs

## Verify Setup

After adding to crontab, verify it's scheduled:

```bash
# List your cron jobs
crontab -l

# Check cron service is running
sudo systemctl status cron

# Manually test the script anytime
./scripts/daily-stock-update.sh
```

## Files Created

```
jjktradinglabs/
├── scripts/
│   ├── daily-stock-update.sh       # Main update script
│   ├── CRON_SETUP.md               # Detailed setup guide
│   └── SETUP_COMPLETE.md           # This file
├── logs/
│   └── daily-update-YYYY-MM-DD.log # Daily logs (auto-cleaned after 30 days)
└── get_stock_data/
    └── csv_files/                  # CSV backups of updates
```

## Troubleshooting

If the cron job doesn't run:

1. **Check cron is running:**
   ```bash
   sudo systemctl status cron
   ```

2. **Check script permissions:**
   ```bash
   ls -l scripts/daily-stock-update.sh
   # Should show: -rwxr-xr-x
   ```

3. **Test manually:**
   ```bash
   ./scripts/daily-stock-update.sh
   ```

4. **Check cron logs:**
   ```bash
   grep CRON /var/log/syslog | tail -20
   ```

For more detailed troubleshooting, see `scripts/CRON_SETUP.md`

## Important Notes

- ⏰ **Timezone**: The script runs at 2 AM in your server's local timezone (currently MDT)
- 📅 **Weekends**: The script will run on weekends but may not find new data (markets closed)
- 🔄 **Updates**: The script only fetches data since the last update (efficient)
- 💾 **Backups**: CSV files are created as backup in `get_stock_data/csv_files/`
- 🧹 **Cleanup**: Logs older than 30 days and data older than 3 years are auto-deleted

## Success! 🎉

Your daily stock data update is ready to go. Just add it to crontab and you're all set!

