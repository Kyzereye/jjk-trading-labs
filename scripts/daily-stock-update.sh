#!/bin/bash

# Daily Stock Data Update Script
# This script runs the daily stock data update and logs the results

# Set up paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GET_STOCK_DATA_DIR="$PROJECT_ROOT/get_stock_data"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/daily-update-$(date +%Y-%m-%d).log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Log start time
echo "================================================" >> "$LOG_FILE"
echo "Daily Stock Update Started: $(date)" >> "$LOG_FILE"
echo "================================================" >> "$LOG_FILE"

# Change to get_stock_data directory
cd "$GET_STOCK_DATA_DIR" || {
    echo "ERROR: Cannot change to directory $GET_STOCK_DATA_DIR" >> "$LOG_FILE"
    exit 1
}

# Load environment variables if .env exists
if [ -f "$PROJECT_ROOT/backend/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/backend/.env" | xargs)
fi

# Run the update script
echo "Running update-stock-data.ts..." >> "$LOG_FILE"
npm run update-daily >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

# Log completion
echo "" >> "$LOG_FILE"
echo "================================================" >> "$LOG_FILE"
echo "Daily Stock Update Completed: $(date)" >> "$LOG_FILE"
echo "Exit Code: $EXIT_CODE" >> "$LOG_FILE"
echo "================================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Keep only last 30 days of logs
find "$LOG_DIR" -name "daily-update-*.log" -type f -mtime +30 -delete

exit $EXIT_CODE

