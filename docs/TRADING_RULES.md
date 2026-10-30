# Trading Rules - Long & Short Positions

## 📊 Moving Average Setup
- **Fast MA**: 21 periods (default)
- **Slow MA**: 50 periods (default)
- **MA Type**: EMA or SMA (user configurable)
- **One trade at a time**: Cannot enter new position while in a position

---

## 📝 QUICK SUMMARY

### **IMPORTANT: Signal vs. Execution**
- **Signal Day**: When price CLOSES above/below MA (end of day)
- **Execution Day**: NEXT day at OPEN price
- **All trades use daily data** (not intraday)

### **Long Trades (Profit when price rises):**
✅ **SIGNAL:** Price CLOSES above slow MA → Enter NEXT day at open  
✅ **RE-ENTER:** Price CLOSES above fast MA (if 21 MA > 50 MA) → Enter NEXT day at open  
❌ **EXIT:** Price CLOSES below fast MA OR trailing stop OR below slow MA → Exit NEXT day at open

### **Short Trades (Profit when price falls):**
✅ **SIGNAL:** Price CLOSES below slow MA → Enter NEXT day at open  
✅ **RE-ENTER:** Price CLOSES below fast MA (if 21 MA < 50 MA) → Enter NEXT day at open  
❌ **EXIT:** Price CLOSES above fast MA OR trailing stop OR above slow MA → Exit NEXT day at open

### **Key Differences:**
| | Long | Short |
|---|------|-------|
| **Entry trigger** | Price > 50 MA | Price < 50 MA |
| **Stop location** | BELOW entry | ABOVE entry |
| **Stop moves** | UP (protects profits) | DOWN (protects profits) |
| **P&L formula** | (Exit - Entry) × Shares | (Entry - Exit) × Shares |

---

## 🟢 LONG TRADE RULES (Verified from Code)

### **Entry Conditions:**

#### **Entry 1 (Primary Entry - New Uptrend)**
**Code Location:** `trading-engine.service.ts` lines 268-301 (signal), 392-428 (execution)

**Signal Trigger:** Price CLOSES above the slow MA (50 MA)

**Exact Conditions (from code):**
```typescript
// Signal generation:
isNewTrend = (
  !inTrade &&                           // Not currently in a position
  currentPrice > ma50Value &&           // Today's CLOSE > 50 MA
  i > 0 &&                              // Not first day
  data[i - 1].close <= ma50[i - 1]      // Yesterday's CLOSE <= 50 MA
)

// Execution (next day):
const nextDayOpen = data[signalIndex + 1].open;  // NEXT day's OPEN price
entry_price = nextDayOpen;                        // Execute at open
```

**What this means:**
- When price CLOSES above slow MA (Day N close)
- Signal is generated at end of Day N
- Trade is ENTERED on Day N+1 at OPEN price
- Entry price = Day N+1 open (NOT Day N close)

**Example:**
```
Day 1: Close = $148, 50 MA = $150 (closed below) - No signal
Day 2: Close = $152, 50 MA = $150 (CLOSED above) - BUY SIGNAL generated ✓
Day 3: Open = $153 - ENTER LONG at $153 ← Actual entry price

Signal Day: Day 2 (close above 50 MA detected)
Entry Day: Day 3 (open price)
Entry Price: $153
```

**Sets (using Day 3 open price $153):**
- Trailing stop = $153 - ($3 × 2.0) = $147
- Highest price tracker = $153
- Reentry count = 0

**Key Point:** 
- "Closes above" triggers signal
- "Next day at open" is execution
- P&L calculated from open prices, not close prices

---

#### **Entry 2 (Re-entry After Pullback)**
**Code Location:** `trading-engine.service.ts` lines 274-321

**Trigger:** Price closes ABOVE the fast MA (21 MA)

**Exact Conditions (from code):**
```typescript
canReenter = (
  !inTrade &&                           // Not currently in a position
  lastExitDate !== null &&              // We exited a previous position
  currentPrice > ma21Value &&           // Today's close > 21 MA
  ma21Value > ma50Value &&              // Uptrend confirmed (21 MA > 50 MA)
  i > 0 &&                              // Not first day
  data[i - 1].close <= ma21[i - 1]      // Yesterday's close <= 21 MA
)
```

**What this means:**
- Price CROSSES above fast MA today (wasn't above it yesterday)
- Must have exited a previous position first
- Uptrend must still be intact (21 MA > 50 MA)
- Allows multiple re-entries during one uptrend

**Example:**
```
Signal Day: Day 5 - Close = $148, 21 MA = $147, 50 MA = $150
            Price CLOSED above 21 MA → SELL SIGNAL generated
Entry Day:  Day 6 - Open = $149 → RE-ENTER LONG at $149
```

**Increments:** `reentryCount++`

**Detailed Walkthrough:**
```
Context: Stock is in uptrend, 21 MA tracking above 50 MA

Day 1: Close = $148, 50 MA = $150 
       Price closed below 50 MA - no signal

Day 2: Close = $152, 50 MA = $150  
       Price CLOSED above 50 MA → BUY SIGNAL ✓
Day 3: Open = $153 → ENTER LONG at $153

Day 4-5: Close = $155, $157 (trending up nicely)

Day 6: Close = $152, 21 MA = $153  
       Price CLOSED below 21 MA → SELL SIGNAL ✓
Day 7: Open = $151 → EXIT LONG at $151
       
Day 8: Close = $151, 21 MA = $152, 50 MA = $150
       Price still below 21 MA, above 50 MA
       21 MA > 50 MA (uptrend intact) - waiting...

Day 9: Close = $154, 21 MA = $153  
       Price CLOSED above 21 MA → BUY SIGNAL (Re-entry!) ✓
Day 10: Open = $155 → RE-ENTER LONG at $155

Day 11-12: Close = $158, $160 (uptrend continues)

Day 13: Close = $148, 50 MA = $151
        Price CLOSED below 50 MA → SELL SIGNAL (Major break) ✓
Day 14: Open = $147 → EXIT LONG at $147
        Uptrend over, cannot re-enter
```

**Key Point for Entry 2:**
- After exit (price CLOSED below fast MA)
- Price stays below fast MA but ABOVE slow MA (pullback in uptrend)  
- Then price turns back up and CLOSES above fast MA again
- This generates Entry 2 signal → Execute NEXT day at open
- Can keep happening as long as 21 MA > 50 MA (uptrend intact)

---

### **Exit Conditions:**

#### **Exit 1 (Price Below Fast MA)**
**Code Location:** `trading-engine.service.ts` lines 336-341

**Trigger:** Price closes BELOW the fast MA (21 MA)

**Exact Conditions (from code):**
```typescript
if (currentPrice < ma21Value) {
  if (i > 0 && data[i - 1].close >= ma21[i - 1]) {
    sellTriggered = true;
    sellReason = "Price closed below 21 MA";
  }
}
```

**What this means:**
- Price CROSSES below fast MA today (wasn't below it yesterday)
- Standard exit - take profits on pullback
- Allows re-entry if uptrend continues

**Example:**
```
Day 5: Enter LONG at $153 (open price after close above 50 MA signal)
Day 6-8: Close = $155, $157, $156 (trending up)
Day 9: Close = $152, 21 MA = $154 (price CLOSED below 21 MA) → SELL SIGNAL ✓
Day 10: Open = $151 → EXIT LONG at $151

Signal Day: Day 9 (close below 21 MA)
Exit Day: Day 10 (open price)
Exit Price: $151
P&L: ($151 - $153) × shares = -$2/share (small loss on pullback)
```

**Result:** 
- Sets `lastExitDate` (enables re-entry)
- If 21 MA still > 50 MA, can re-enter via Entry 2 when price closes above 21 MA again

---

#### **Exit 2 (Trailing Stop Hit)**
**Code Location:** `trading-engine.service.ts` lines 342-344

**Trigger:** Price falls below trailing stop

**Exact Conditions (from code):**
```typescript
else if (currentTrailingStop !== null && currentPrice < currentTrailingStop) {
  sellTriggered = true;
  sellReason = "Price hit trailing stop";
}
```

**Trailing Stop Calculation:**
```typescript
// Updates daily:
if (currentPrice > highestPriceSinceEntry) {
  highestPriceSinceEntry = currentPrice;
  currentTrailingStop = highestPriceSinceEntry - (atr × multiplier);
}
```

**What this means:**
- Stop moves UP as price makes new highs
- Stop NEVER moves down
- Protects profits

**Example:**
```
Entry: $150, ATR = $3, Multiplier = 2.0
Initial Stop: $150 - $6 = $144
Day 5: High = $158, Stop = $158 - $6 = $152 (moved up)
Day 6: Close = $151 (< $152) - EXIT LONG ✓
```

---

#### **Exit 3 (Major Trend Break)**
**Code Location:** `trading-engine.service.ts` lines 345-348

**Trigger:** Price closes BELOW the slow MA (50 MA)

**Exact Conditions (from code):**
```typescript
else if (currentPrice < ma50Value) {
  sellTriggered = true;
  sellReason = "Major trend break: Price closed below 50 MA";
}
```

**What this means:**
- Uptrend is completely over
- Exit immediately
- No re-entry allowed (must wait for new Entry 1)

**Example:**
```
Entry: $152 (above 50 MA)
Price: $160 (trending up)
Day N: Close = $148 (below 50 MA of $150) - EXIT LONG ✓
```

**Result:** 
- Resets everything (no re-entry until new crossover)
- `lastExitDate` is set but re-entry won't trigger unless price crosses above 50 MA again

---

## 🔴 SHORT TRADE RULES (Mirrored from Long Logic)

### **Entry Conditions:**

#### **Entry 1 (Primary Entry - New Downtrend)**
**Trigger:** Price closes BELOW the slow MA (50 MA)

**Exact Conditions (mirrored from long):**
```typescript
isNewDowntrend = (
  !inTrade &&                           // Not currently in a position
  currentPrice < ma50Value &&           // Today's close < 50 MA
  i > 0 &&                              // Not first day
  data[i - 1].close >= ma50[i - 1]      // Yesterday's close >= 50 MA
)
```

**What this means:**
- Price CROSSES below slow MA today (wasn't below it yesterday)
- Immediate entry when slow MA is crossed downward
- No trend confirmation required

**Example:**
```
Day 1: Close = $152 (above 50 MA of $150) - No entry
Day 2: Close = $148 (below 50 MA of $150) - ENTRY SHORT ✓
```

**Sets:**
- Trailing stop = Entry + (ATR × multiplier_short) ← ABOVE entry!
- Lowest price tracker = Entry price
- Reentry count = 0

---

#### **Entry 2 (Re-entry After Bounce)**
**Trigger:** Price closes BELOW the fast MA (21 MA)

**Exact Conditions (mirrored from long):**
```typescript
canReenterShort = (
  !inTrade &&                           // Not currently in a position
  lastExitDate !== null &&              // We exited a previous position
  currentPrice < ma21Value &&           // Today's close < 21 MA
  ma21Value < ma50Value &&              // Downtrend confirmed (21 MA < 50 MA)
  i > 0 &&                              // Not first day
  data[i - 1].close >= ma21[i - 1]      // Yesterday's close >= 21 MA
)
```

**What this means:**
- Chart is in downtrend (fast MA below slow MA)
- Previous short was exited (Exit 2 - price bounced above fast MA)
- Price had bounced above fast MA but stayed below slow MA (no trend reversal)
- Price now turns back down and CROSSES below fast MA again
- Re-enter short to continue riding the downtrend

**Example:**
```
Entry 1: $148 (crossed below 50 MA of $150) - SHORT ENTERED
Price: $145 (trending down nicely)
Exit 2: $147 (price bounced, crossed above 21 MA) - EXIT SHORT
Price: $147 (above 21 MA but still below 50 MA - bounce, not reversal)
21 MA = $146, 50 MA = $150 (downtrend still intact: 21 < 50)
Day N: Close = $145 (crossed back below 21 MA) - RE-ENTRY SHORT ✓
```

**Key Point:** 
- Price bounced above fast MA but NEVER crossed above slow MA
- If price had crossed above slow MA, that would reset everything (need Entry 1 again)
- This re-entry catches the continuation of the downtrend after a temporary bounce

**Increments:** `reentryCount++`

**Note:** Re-entry can happen multiple times during a single downtrend

**Detailed Walkthrough:**
```
Context: Stock is in downtrend, 21 MA tracking below 50 MA

Day 1: Close = $152, 21 MA = $148, 50 MA = $150
       Price above both MAs - no trade

Day 2: Close = $148, 21 MA = $148, 50 MA = $150  
       Price crosses below 50 MA → ENTRY 1 SHORT at $148

Day 3-5: Price = $145, $143, $141 (trending down nicely)

Day 6: Close = $144, 21 MA = $145, 50 MA = $149
       Price crosses ABOVE 21 MA (bounce) → EXIT 1 SHORT
       
Day 7: Close = $145, 21 MA = $145, 50 MA = $149
       Price above 21 MA but still below 50 MA
       21 MA < 50 MA (downtrend still intact)
       No trade yet - waiting...

Day 8: Close = $143, 21 MA = $144, 50 MA = $149
       Price crosses BELOW 21 MA again → ENTRY 2 SHORT (Re-entry!)
       Continuing the downtrend

Day 9-10: Price = $140, $138 (downtrend continues)

Day 11: Close = $151, 21 MA = $143, 50 MA = $148
        Price crosses ABOVE 50 MA → EXIT 3 SHORT (Major reversal)
        Downtrend over, cannot re-enter
```

**Key Point for Entry 2:**
- After EXIT 1 (price crossed above fast MA)
- Price stays above fast MA but BELOW slow MA (bounce in downtrend)
- Then price turns back down and crosses BELOW fast MA again
- This triggers Entry 2 (re-entry)
- Can keep happening as long as 21 MA < 50 MA (downtrend intact)

---

### **Exit Conditions:**

#### **Exit 1 (Price Above Fast MA - Standard Exit)**
**Trigger:** Price closes ABOVE the fast MA (21 MA)

**Exact Conditions (mirrored from long):**
```typescript
if (currentPrice > ma21Value) {
  if (i > 0 && data[i - 1].close <= ma21[i - 1]) {
    coverTriggered = true;
    coverReason = "Price closed above 21 MA";
  }
}
```

**What this means:**
- Price CROSSES above fast MA today (wasn't above it yesterday)
- Standard exit - price is bouncing/reversing
- Allows re-entry if downtrend continues

**Example:**
```
Entry: $148 (below 50 MA)
Price: $145 (trending down)
Day N: Close = $147 (crossed above 21 MA) - EXIT SHORT ✓
```

**Result:** 
- Sets `lastExitDate` (enables re-entry)
- If 21 MA still < 50 MA, can re-enter via Entry 2
- This is Exit 2 that you mentioned!

---

#### **Exit 2 (Trailing Stop Hit)**
**Trigger:** Price rises above trailing stop

**Exact Conditions (mirrored from long):**
```typescript
else if (currentTrailingStop !== null && currentPrice > currentTrailingStop) {
  coverTriggered = true;
  coverReason = "Price hit trailing stop";
}
```

**Trailing Stop Calculation:**
```typescript
// Updates daily:
if (currentPrice < lowestPriceSinceEntry) {
  lowestPriceSinceEntry = currentPrice;
  currentTrailingStop = lowestPriceSinceEntry + (atr × multiplier_short);
}
```

**What this means:**
- Stop moves DOWN as price makes new lows (locks in profits)
- Stop NEVER moves up
- Stop is ABOVE entry price
- Limits losses if price reverses upward

**Example:**
```
Entry: $150, ATR = $3, Multiplier = 1.5
Initial Stop: $150 + $4.50 = $154.50 (ABOVE entry!)
Day 2: Low = $145, Stop = $145 + $4.50 = $149.50 (moved down)
Day 3: Low = $142, Stop = $142 + $4.50 = $146.50 (moved down more)
Day 4: Close = $148 (> $146.50) - EXIT SHORT ✓
```

**Key Difference from Longs:**
- Short stops are ABOVE entry (longs are BELOW)
- Short stops move DOWN (longs move UP)
- Shorts use tighter multiplier (1.5x vs 2.0x)

---

#### **Exit 3 (Major Trend Reversal)**
**Trigger:** Price closes ABOVE the slow MA (50 MA)

**Exact Conditions (mirrored from long):**
```typescript
else if (currentPrice > ma50Value) {
  coverTriggered = true;
  coverReason = "Major trend reversal: Price closed above 50 MA";
}
```

**What this means:**
- Downtrend is completely over
- Exit immediately
- No re-entry allowed (must wait for new Entry 1)

**Example:**
```
Entry: $148 (below 50 MA of $150)
Price: $140 (trending down)
Day N: Close = $152 (above 50 MA of $150) - EXIT SHORT ✓
```

**Result:** 
- Resets everything (no re-entry until price crosses below 50 MA again)
- Must wait for new downtrend to start

---

## 📐 P&L Calculations

### **Long Position:**
```
P&L = (Exit Price - Entry Price) × Shares
Profit: Exit > Entry (price went UP)
Loss: Exit < Entry (price went DOWN)
```

### **Short Position:**
```
P&L = (Entry Price - Exit Price) × Shares
Profit: Exit < Entry (price went DOWN) ← Reverse!
Loss: Exit > Entry (price went UP)
```

**Example:**
```
SHORT 100 shares @ $150
Exit @ $140
P&L = ($150 - $140) × 100 = +$1,000 ✓ Profit!

SHORT 100 shares @ $150  
Exit @ $160
P&L = ($150 - $160) × 100 = -$1,000 ✗ Loss!
```

---

## 🎯 Position Sizing

### **Long Positions:**
- Default: 5% of capital
- Max: 10% (user configurable)
- Risk: Limited to initial investment

### **Short Positions:**
- Default: 3% of capital
- Max: 5% (hardcoded limit for safety)
- Risk: Unlimited (stock can rise infinitely)

**Formula:**
```
Shares = (Capital × sizing_percentage) / Entry_Price
```

---

## 🛡️ Stop Loss Logic

### **Long Positions:**
```
Initial Stop = Entry Price - (ATR × multiplier_long)
Trailing Stop = Highest Price - (ATR × multiplier_long)

Stop moves UP as price rises (locks in profits)
Stop NEVER moves down
Exit if: Current Price < Trailing Stop
```

### **Short Positions:**
```
Initial Stop = Entry Price + (ATR × multiplier_short)
Trailing Stop = Lowest Price + (ATR × multiplier_short)

Stop moves DOWN as price falls (locks in profits)
Stop NEVER moves up
Exit if: Current Price > Trailing Stop
```

**Key Difference:** Short stops are ABOVE entry, long stops are BELOW entry!

---

## 🔄 Trade State Machine

### **Long Trade Flow:**
```
NO POSITION
    ↓ [Entry 1: Price > Slow MA]
LONG ACTIVE
    ↓ [Exit 1, 2, 3, or 4]
NO POSITION
    ↓ [Entry 2: Price > Fast MA] (if trend still up)
LONG ACTIVE (re-entry)
    ↓ [Exit]
    ... (can re-enter multiple times)
```

### **Short Trade Flow:**
```
NO POSITION
    ↓ [Entry 1: Price < Slow MA]
SHORT ACTIVE
    ↓ [Exit 1, 2, 3, or 4]
NO POSITION
    ↓ [Entry 2: Price < Fast MA] (if trend still down)
SHORT ACTIVE (re-entry)
    ↓ [Exit]
    ... (can re-enter multiple times)
```

### **Combined (Long + Short) Flow:**
```
NO POSITION
    ↓ [Price > Slow MA & 21>50]
LONG ACTIVE
    ↓ [Exit]
NO POSITION
    ↓ [Price < Slow MA & 21<50]
SHORT ACTIVE
    ↓ [Exit]
NO POSITION
    (cycle continues)
```

---

## ⚡ Quick Reference Table

| Condition | Long | Short |
|-----------|------|-------|
| **Entry 1** | Price crosses ABOVE Slow MA | Price crosses BELOW Slow MA |
| **Entry 2** | Price crosses ABOVE Fast MA (after exit, if 21>50) | Price crosses BELOW Fast MA (after exit, if 21<50) |
| **Exit 1** | Price crosses BELOW Fast MA | Price crosses ABOVE Fast MA |
| **Exit 2** | Price < Trailing Stop | Price > Trailing Stop |
| **Exit 3** | Price crosses BELOW Slow MA (major break) | Price crosses ABOVE Slow MA (major reversal) |
| **Stop Location** | BELOW entry | ABOVE entry |
| **Stop Movement** | Moves UP with new highs | Moves DOWN with new lows |
| **Stop Formula** | High - (ATR × 2.0) | Low + (ATR × 1.5) |
| **Profit When** | Price rises (sell higher) | Price falls (buy back lower) |
| **Position Size** | 5% default (max 10%) | 3% default (max 5%) |
| **ATR Multiplier** | 2.0 default | 1.5 default (tighter) |
| **Re-entry Condition** | 21 MA > 50 MA (uptrend) | 21 MA < 50 MA (downtrend) |

---

## 🔍 Edge Cases & Rules

### **Rule 1: One Position at a Time**
- Cannot be LONG and SHORT simultaneously in same stock
- Must fully exit before entering opposite direction
- Re-entries are allowed (same direction only)

### **Rule 2: Trend Confirmation**
**Entry 1 (Primary):**
- Long: NO confirmation needed - just price > slow MA
- Short: NO confirmation needed - just price < slow MA

**Entry 2 (Re-entry):**
- Long: REQUIRES 21 MA > 50 MA (uptrend must be intact)
- Short: REQUIRES 21 MA < 50 MA (downtrend must be intact)

**For "Both" Mode:**
- Can only enter long if 21 MA > 50 MA
- Can only enter short if 21 MA < 50 MA
- Never both simultaneously

### **Rule 3: Re-entry vs. New Entry**
**Re-entry (Entry 2):**
- Happens after Exit 1 (crossed fast MA)
- Trend still intact (MAs aligned: 21>50 for long, 21<50 for short)
- Price didn't cross slow MA (no reset)

**New Entry (Entry 1):**
- Happens after Exit 2 or Exit 3 (stop hit or major trend break)
- Requires price to cross slow MA again
- Resets entry count

### **Rule 4: Trailing Stop Updates**
**Long:**
- Recalculates daily using highest price
- If today's high > previous high: Stop = new high - (ATR × multiplier)
- If today's high < previous high: Stop unchanged (stays at previous level)

**Short:**
- Recalculates daily using lowest price
- If today's low < previous low: Stop = new low + (ATR × multiplier)
- If today's low > previous low: Stop unchanged (stays at previous level)

---

## 🎯 Strategy Modes

### **Mode 1: Long Only**
- Only generates Entry 1, Entry 2 for long positions
- Ignores downtrends completely
- Safest, most common approach

### **Mode 2: Short Only**
- Only generates Entry 1, Entry 2 for short positions
- Ignores uptrends completely
- Good for bear markets or bearish stocks

### **Mode 3: Long + Short (Both)**
- Switches between long and short based on trend
- When uptrend (21 > 50): Goes long
- When downtrend (21 < 50): Goes short
- **Never both simultaneously**
- Can transition: LONG → Exit → SHORT → Exit → LONG

**Example:**
```
Jan: 21 MA > 50 MA → LONG position
Mar: Exit → Price crosses below 50 MA, 21 < 50 → SHORT position
May: Exit → Price crosses above 50 MA, 21 > 50 → LONG position
```

---

## 💰 Position Sizing Details

### **Long Position Sizing:**
```
Default: 5% of capital
User Range: 1% - 10%
Calculation: (Capital × 0.05) / Entry_Price = Shares

Example:
Capital: $100,000
Entry: $150
Position Size: 5%
Shares: ($100,000 × 0.05) / $150 = 333 shares
```

### **Short Position Sizing:**
```
Default: 3% of capital
User Range: 1% - 5% (hardcoded max for safety)
Calculation: (Capital × 0.03) / Entry_Price = Shares

Example:
Capital: $100,000
Entry: $150  
Position Size: 3%
Shares: ($100,000 × 0.03) / $150 = 200 shares
```

**Why smaller for shorts?**
- Unlimited loss potential (stock can rise infinitely)
- Shorts move faster (more volatile)
- Margin requirements
- Higher risk = smaller size

---

## 📈 Performance Metrics

### **Separate Tracking:**
```
LONG TRADES:
- Total Trades: 45
- Win Rate: 62%
- Total P&L: +$12,450
- Avg Trade Duration: 23 days
- Max Drawdown: -8.5%

SHORT TRADES:
- Total Trades: 23
- Win Rate: 54%
- Total P&L: +$5,320
- Avg Trade Duration: 15 days
- Max Drawdown: -12.3%

COMBINED (LONG + SHORT):
- Total Trades: 68
- Win Rate: 60%
- Total P&L: +$17,770
- Max Drawdown: -10.2%
- Sharpe Ratio: 1.85
```

---

## 🧪 Backtesting Scenarios

### **Test 1: Long Only (Bull Market)**
**Best for:**
- Strong uptrending stocks (AAPL, MSFT, NVDA)
- Bull markets
- Less risky, easier to execute

**Expected:**
- Higher win rate (55-65%)
- Longer trades (20-40 days)
- Steady growth

---

### **Test 2: Short Only (Bear Market)**
**Best for:**
- Downtrending stocks
- Bear markets or corrections
- Volatile/overvalued stocks

**Expected:**
- Lower win rate (45-55%)
- Faster trades (10-20 days)
- Quick profits or quick losses

---

### **Test 3: Long + Short (Both Directions)**
**Best for:**
- Volatile stocks that trend both ways
- Sideways/choppy markets
- Maximizing opportunities

**Expected:**
- More trades (2x)
- Balanced win rate (50-60%)
- Better performance in all market conditions
- Highest complexity

---

## ⚠️ Important Notes

### **For Long Trades:**
1. **Confirmations matter**: Wait for price to close above slow MA
2. **Re-entries are powerful**: Catch pullbacks in strong trends
3. **Trailing stops protect**: Lock in profits as price rises

### **For Short Trades:**
1. **Riskier by nature**: Unlimited downside if wrong
2. **Tighter stops recommended**: Use 1.5x ATR instead of 2.0x
3. **Move faster**: Short squeezes can be violent
4. **Not all stocks shortable**: Need to check "hard to borrow" status

### **For Both Mode:**
1. **Can't be long AND short**: One direction at a time
2. **Transitions allowed**: Can go from LONG → SHORT seamlessly
3. **More opportunities**: Catch both up and down trends
4. **More complex**: Higher chance of whipsaws

---

## 🔧 Technical Implementation Notes

### **Signal Types:**
```typescript
'BUY'           // Enter long (Entry 1 or 2)
'SELL'          // Exit long (Exit 1, 2, 3, or 4)
'SELL_SHORT'    // Enter short (Entry 1 or 2)
'BUY_TO_COVER'  // Exit short (Exit 1, 2, 3, or 4)
```

### **Position Type:**
```typescript
enum PositionType {
  LONG = 'long',
  SHORT = 'short'
}
```

### **Trade Record:**
```typescript
interface Trade {
  position_type: 'long' | 'short';
  entry_type: 1 | 2;  // Primary or re-entry
  exit_type: 1 | 2 | 3 | 4;  // Weak, standard, stop, or major
  is_reentry: boolean;
  reentry_count: number;
  // ... other fields
}
```

---

*Last Updated: October 18, 2025*
*Version: 1.0*

