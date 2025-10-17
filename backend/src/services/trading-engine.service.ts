/**
 * Moving Average Trading Engine
 * Ported from Python to TypeScript
 */

export interface MASignal {
  date: Date;
  signal_type: 'BUY' | 'SELL';
  price: number;
  ma_21: number;
  ma_50: number;
  reasoning: string;
  confidence: number;
  atr?: number;
  trailing_stop?: number;
}

export interface MeanReversionAlert {
  date: Date;
  price: number;
  ma_21: number;
  distance_percent: number;
  reasoning: string;
  trailing_stop?: number;
}

export interface MATrade {
  entry_date: Date;
  exit_date?: Date;
  entry_price: number;
  exit_price?: number;
  entry_signal: string;
  exit_signal: string;
  shares: number;
  pnl?: number;
  pnl_percent?: number;
  duration_days?: number;
  exit_reason?: string;
  is_reentry: boolean;
  reentry_count: number;
  running_pnl?: number;
  running_capital?: number;
  drawdown?: number;
}

export interface MAResults {
  symbol: string;
  start_date: Date;
  end_date: Date;
  total_days: number;
  trades: MATrade[];
  signals: MASignal[];
  mean_reversion_alerts: MeanReversionAlert[];
  performance_metrics: {
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    total_pnl: number;
    total_return_percent: number;
    avg_trade_duration: number;
    max_drawdown: number;
    sharpe_ratio: number;
  };
  equity_curve: Array<[Date, number]>;
}

export interface StockData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class MATradingEngine {
  private initialCapital: number;
  private atrPeriod: number;
  private atrMultiplier: number;
  private maType: string;
  private ma21Period: number;
  private ma50Period: number;
  private meanReversionThreshold: number;
  private positionSizingPercentage: number;

  constructor(
    initialCapital: number = 100000,
    atrPeriod: number = 14,
    atrMultiplier: number = 2.0,
    maType: string = 'ema',
    customFastMa?: number,
    customSlowMa?: number,
    meanReversionThreshold: number = 10.0,
    positionSizingPercentage: number = 5.0
  ) {
    this.initialCapital = initialCapital;
    this.atrPeriod = atrPeriod;
    this.atrMultiplier = atrMultiplier;
    this.maType = maType.toLowerCase();
    this.meanReversionThreshold = meanReversionThreshold;
    this.positionSizingPercentage = positionSizingPercentage;

    // Set MA periods
    if (customFastMa && customSlowMa) {
      this.ma21Period = customFastMa;
      this.ma50Period = customSlowMa;
    } else {
      this.ma21Period = 21;
      this.ma50Period = 50;
    }
  }

  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(data: number[], period: number): number[] {
    const result: number[] = new Array(data.length).fill(NaN);
    const alpha = 2 / (period + 1);
    
    // First EMA value is SMA
    let sum = 0;
    for (let i = 0; i < period && i < data.length; i++) {
      sum += data[i];
    }
    result[period - 1] = sum / period;
    
    // Calculate EMA for remaining values
    for (let i = period; i < data.length; i++) {
      result[i] = alpha * data[i] + (1 - alpha) * result[i - 1];
    }
    
    return result;
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateSMA(data: number[], period: number): number[] {
    const result: number[] = new Array(data.length).fill(NaN);
    
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result[i] = sum / period;
    }
    
    return result;
  }

  /**
   * Calculate Moving Average (EMA or SMA)
   */
  private calculateMA(data: number[], period: number): number[] {
    if (this.maType === 'sma') {
      return this.calculateSMA(data, period);
    } else {
      return this.calculateEMA(data, period);
    }
  }

  /**
   * Calculate Average True Range (ATR)
   */
  private calculateATR(data: StockData[], period: number): number[] {
    const result: number[] = new Array(data.length).fill(NaN);
    
    // Calculate True Range for each period
    const trueRanges: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const tr1 = data[i].high - data[i].low;
      const tr2 = Math.abs(data[i].high - data[i - 1].close);
      const tr3 = Math.abs(data[i].low - data[i - 1].close);
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }
    
    // Calculate ATR as EMA of True Range
    const atrValues = this.calculateEMA(trueRanges, period);
    
    // Copy ATR values to result array (offset by 1 due to TR calculation)
    for (let i = 0; i < atrValues.length; i++) {
      result[i + 1] = atrValues[i];
    }
    
    return result;
  }

  /**
   * Run Moving Average trading analysis
   */
  async runAnalysis(data: StockData[], symbol: string): Promise<MAResults> {
    console.log(`Starting ${this.maType.toUpperCase()} analysis for ${symbol}`);

    if (data.length < this.ma50Period) {
      throw new Error(`Not enough data for ${this.maType.toUpperCase()} analysis. Need at least ${this.ma50Period} days`);
    }

    // Extract close prices
    const closePrices = data.map(d => d.close);
    
    // Calculate Moving Averages and ATR
    const ma21 = this.calculateMA(closePrices, this.ma21Period);
    const ma50 = this.calculateMA(closePrices, this.ma50Period);
    const atr = this.calculateATR(data, this.atrPeriod);

    // Generate signals
    const signals = this.generateSignals(data, ma21, ma50, atr);

    // Execute trades
    const trades = this.executeTrades(data, signals);

    // Generate mean reversion alerts
    const meanReversionAlerts = this.generateMeanReversionAlerts(data, ma21, trades);

    // Calculate performance metrics
    const performanceMetrics = this.calculatePerformanceMetrics(trades);

    // Generate equity curve
    const equityCurve = this.generateEquityCurve(data, trades);

    // Sort data by date (newest first)
    trades.sort((a, b) => b.entry_date.getTime() - a.entry_date.getTime());
    signals.sort((a, b) => b.date.getTime() - a.date.getTime());
    meanReversionAlerts.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      symbol,
      start_date: data[0].date,
      end_date: data[data.length - 1].date,
      total_days: data.length,
      trades,
      signals,
      mean_reversion_alerts: meanReversionAlerts,
      performance_metrics: performanceMetrics,
      equity_curve: equityCurve
    };
  }

  /**
   * Generate Enhanced Moving Average trading signals with re-entry logic
   */
  private generateSignals(data: StockData[], ma21: number[], ma50: number[], atr: number[]): MASignal[] {
    const signals: MASignal[] = [];
    let inTrade = false;
    let currentTrailingStop: number | null = null;
    let highestPriceSinceEntry: number | null = null;
    let lastExitDate: Date | null = null;
    let reentryCount = 0;
    let trendStartDate: Date | null = null;

    const startIndex = Math.max(this.ma50Period, this.atrPeriod);

    for (let i = startIndex; i < data.length; i++) {
      const currentPrice = data[i].close;
      const ma21Value = ma21[i];
      const ma50Value = ma50[i];
      const atrValue = atr[i];
      const date = data[i].date;

      // Skip if indicators are not calculated yet
      if (isNaN(ma21Value) || isNaN(ma50Value) || isNaN(atrValue)) {
        continue;
      }

      // Check if we're in a new trend
      const isNewTrend = (!inTrade &&
        currentPrice > ma50Value &&
        i > 0 &&
        data[i - 1].close <= ma50[i - 1]);

      // Check if we can re-enter
      const canReenter = (!inTrade &&
        lastExitDate !== null &&
        currentPrice > ma21Value &&
        ma21Value > ma50Value &&
        i > 0 &&
        data[i - 1].close <= ma21[i - 1]);

      // ENTRY LOGIC
      if (isNewTrend) {
        // Primary entry: Price closes above 50 MA
        const confidence = Math.min(0.9, Math.abs(currentPrice - ma50Value) / ma50Value * 10);
        currentTrailingStop = currentPrice - (atrValue * this.atrMultiplier);
        highestPriceSinceEntry = currentPrice;
        trendStartDate = date;
        reentryCount = 0;

        signals.push({
          date,
          signal_type: 'BUY',
          price: currentPrice,
          ma_21: ma21Value,
          ma_50: ma50Value,
          reasoning: `Primary entry: Price ${currentPrice.toFixed(2)} closed above 50 ${this.maType.toUpperCase()} ${ma50Value.toFixed(2)}`,
          confidence,
          atr: atrValue,
          trailing_stop: currentTrailingStop
        });
        inTrade = true;

      } else if (canReenter) {
        // Re-entry: Price closes above 21 MA after exit
        const confidence = Math.min(0.8, Math.abs(currentPrice - ma21Value) / ma21Value * 10);
        currentTrailingStop = currentPrice - (atrValue * this.atrMultiplier);
        highestPriceSinceEntry = currentPrice;
        reentryCount++;

        signals.push({
          date,
          signal_type: 'BUY',
          price: currentPrice,
          ma_21: ma21Value,
          ma_50: ma50Value,
          reasoning: `Re-entry #${reentryCount}: Price ${currentPrice.toFixed(2)} closed above 21 ${this.maType.toUpperCase()} ${ma21Value.toFixed(2)} (trend confirmed: 21 MA > 50 MA)`,
          confidence,
          atr: atrValue,
          trailing_stop: currentTrailingStop
        });
        inTrade = true;
      }

      // EXIT LOGIC (only if in trade)
      if (inTrade) {
        // Update highest price since entry
        if (highestPriceSinceEntry === null || currentPrice > highestPriceSinceEntry) {
          highestPriceSinceEntry = currentPrice;
          currentTrailingStop = highestPriceSinceEntry - (atrValue * this.atrMultiplier);
        }

        // Check for SELL signals
        let sellTriggered = false;
        let sellReason = '';

        if (currentPrice < ma21Value) {
          // Check if this is a new signal
          if (i > 0 && data[i - 1].close >= ma21[i - 1]) {
            sellTriggered = true;
            sellReason = `Price ${currentPrice.toFixed(2)} closed below 21 ${this.maType.toUpperCase()} ${ma21Value.toFixed(2)}`;
          }
        } else if (currentTrailingStop !== null && currentPrice < currentTrailingStop) {
          sellTriggered = true;
          sellReason = `Price ${currentPrice.toFixed(2)} hit trailing stop ${currentTrailingStop.toFixed(2)}`;
        } else if (currentPrice < ma50Value) {
          // Major trend break
          sellTriggered = true;
          sellReason = `Major trend break: Price ${currentPrice.toFixed(2)} closed below 50 ${this.maType.toUpperCase()} ${ma50Value.toFixed(2)}`;
        }

        if (sellTriggered) {
          const confidence = Math.min(0.9, Math.abs(currentPrice - ma21Value) / ma21Value * 10);
          signals.push({
            date,
            signal_type: 'SELL',
            price: currentPrice,
            ma_21: ma21Value,
            ma_50: ma50Value,
            reasoning: sellReason,
            confidence,
            atr: atrValue,
            trailing_stop: currentTrailingStop || undefined
          });
          inTrade = false;
          lastExitDate = date;
          currentTrailingStop = null;
          highestPriceSinceEntry = null;
        }
      }
    }

    return signals;
  }

  /**
   * Execute trades based on signals
   */
  private executeTrades(data: StockData[], signals: MASignal[]): MATrade[] {
    const trades: MATrade[] = [];
    let currentPosition: any = null;
    let availableCapital = this.initialCapital;
    let reentryCount = 0;

    // Create a mapping of dates to data indices
    const dateToIndex = new Map<string, number>();
    data.forEach((item, index) => {
      dateToIndex.set(item.date.toISOString().split('T')[0], index);
    });

    for (const signal of signals) {
      if (signal.signal_type === 'BUY' && currentPosition === null) {
        // Find the next day's open price for entry
        const signalDateStr = signal.date.toISOString().split('T')[0];
        const signalIndex = dateToIndex.get(signalDateStr);
        
        if (signalIndex !== undefined && signalIndex + 1 < data.length) {
          const nextDayIndex = signalIndex + 1;
          const nextDayOpen = data[nextDayIndex].open;
          const nextDayDate = data[nextDayIndex].date;

          // Determine if this is a re-entry
          const isReentry = signal.reasoning.includes('Re-entry');
          if (isReentry) {
            reentryCount++;
            const positionCapital = availableCapital * (this.positionSizingPercentage / 100) * 0.5;
          } else {
            reentryCount = 0;
            const positionCapital = availableCapital * (this.positionSizingPercentage / 100);
          }

          const positionCapital = isReentry 
            ? availableCapital * (this.positionSizingPercentage / 100) * 0.5
            : availableCapital * (this.positionSizingPercentage / 100);

          const shares = Math.floor(positionCapital / nextDayOpen);
          
          if (shares > 0) {
            currentPosition = {
              entry_date: nextDayDate,
              entry_price: nextDayOpen,
              entry_signal: signal.reasoning,
              shares,
              is_reentry: isReentry,
              reentry_count: reentryCount
            };
            availableCapital -= shares * nextDayOpen;
          }
        }

      } else if (signal.signal_type === 'SELL' && currentPosition !== null) {
        // Find the next day's open price for exit
        const signalDateStr = signal.date.toISOString().split('T')[0];
        const signalIndex = dateToIndex.get(signalDateStr);
        
        if (signalIndex !== undefined && signalIndex + 1 < data.length) {
          const nextDayIndex = signalIndex + 1;
          const nextDayOpen = data[nextDayIndex].open;
          const nextDayDate = data[nextDayIndex].date;
          const shares = currentPosition.shares;
          const pnl = shares * (nextDayOpen - currentPosition.entry_price);
          const pnlPercent = (nextDayOpen - currentPosition.entry_price) / currentPosition.entry_price * 100;
          const duration = Math.floor((nextDayDate.getTime() - currentPosition.entry_date.getTime()) / (1000 * 60 * 60 * 24));

          // Determine exit reason
          let exitReason = 'MA Signal';
          if (signal.reasoning.toLowerCase().includes('trailing stop')) {
            exitReason = 'Trailing Stop';
          } else if (signal.reasoning.includes('Major trend break')) {
            exitReason = 'Trend Break';
          }

          const trade: MATrade = {
            entry_date: currentPosition.entry_date,
            exit_date: nextDayDate,
            entry_price: currentPosition.entry_price,
            exit_price: nextDayOpen,
            entry_signal: currentPosition.entry_signal,
            exit_signal: signal.reasoning,
            shares,
            pnl,
            pnl_percent: pnlPercent,
            duration_days: duration,
            exit_reason: exitReason,
            is_reentry: currentPosition.is_reentry,
            reentry_count: currentPosition.reentry_count
          };

          trades.push(trade);
          availableCapital += shares * nextDayOpen;
          currentPosition = null;
        }
      }
    }

    // Close any remaining position at the end
    if (currentPosition !== null) {
      const finalPrice = data[data.length - 1].close;
      const finalDate = data[data.length - 1].date;
      const shares = currentPosition.shares;
      const pnl = shares * (finalPrice - currentPosition.entry_price);
      const pnlPercent = (finalPrice - currentPosition.entry_price) / currentPosition.entry_price * 100;
      const duration = Math.floor((finalDate.getTime() - currentPosition.entry_date.getTime()) / (1000 * 60 * 60 * 24));

      const trade: MATrade = {
        entry_date: currentPosition.entry_date,
        exit_date: finalDate,
        entry_price: currentPosition.entry_price,
        exit_price: finalPrice,
        entry_signal: currentPosition.entry_signal,
        exit_signal: 'End of period - position closed',
        shares,
        pnl,
        pnl_percent: pnlPercent,
        duration_days: duration,
        is_reentry: currentPosition.is_reentry,
        reentry_count: currentPosition.reentry_count
      };

      trades.push(trade);
    }

    // Calculate running metrics for all trades
    this.calculateRunningMetrics(trades);

    return trades;
  }

  /**
   * Calculate running P&L, running capital, and drawdown for each trade
   */
  private calculateRunningMetrics(trades: MATrade[]): void {
    let runningPnL: number = 0;
    let runningCapital: number = Number(this.initialCapital);
    let peakCapital: number = Number(this.initialCapital);

    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      if (trade.pnl !== undefined) {
        const tradePnL = Number(trade.pnl);
        runningPnL = runningPnL + tradePnL;
        runningCapital = runningCapital + tradePnL;
        
        // Update peak capital
        if (runningCapital > peakCapital) {
          peakCapital = runningCapital;
        }
        
        // Calculate drawdown from peak
        const drawdown = ((runningCapital - peakCapital) / peakCapital) * 100;
        
        // Add running metrics to trade
        trade.running_pnl = Number(runningPnL.toFixed(2));
        trade.running_capital = Number(runningCapital.toFixed(2));
        trade.drawdown = Number(drawdown.toFixed(2));
      }
    }
  }

  /**
   * Generate mean reversion alerts
   */
  private generateMeanReversionAlerts(data: StockData[], ma21: number[], trades: MATrade[]): MeanReversionAlert[] {
    const alerts: MeanReversionAlert[] = [];

    // Create a set of dates when we're in a trade
    const tradeDates = new Set<string>();
    for (const trade of trades) {
      if (trade.entry_date && trade.exit_date) {
        const currentDate = new Date(trade.entry_date);
        const endDate = new Date(trade.exit_date);
        
        while (currentDate <= endDate) {
          tradeDates.add(currentDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    }

    let alertTriggered = false;
    let peakDistance = 0;

    for (let i = 0; i < data.length; i++) {
      if (isNaN(ma21[i])) continue;

      const dateStr = data[i].date.toISOString().split('T')[0];
      
      // Only check for alerts when we're in a trade
      if (!tradeDates.has(dateStr)) {
        alertTriggered = false;
        peakDistance = 0;
        continue;
      }

      const currentPrice = data[i].close;
      const ma21Value = ma21[i];
      const distancePercent = Math.abs(currentPrice - ma21Value) / ma21Value * 100;

      // Check if price is above MA and beyond threshold
      if (currentPrice > ma21Value && distancePercent >= this.meanReversionThreshold) {
        if (!alertTriggered) {
          alerts.push({
            date: data[i].date,
            price: currentPrice,
            ma_21: ma21Value,
            distance_percent: distancePercent,
            reasoning: `Price ${distancePercent.toFixed(1)}% above 21-MA during trade - potential mean reversion (overbought)`
          });
          alertTriggered = true;
          peakDistance = distancePercent;
        } else {
          if (distancePercent > peakDistance) {
            peakDistance = distancePercent;
          }
        }
      } else {
        // Reset alert when price drops to 50% of peak distance
        if (alertTriggered && distancePercent < (peakDistance * 0.5)) {
          alertTriggered = false;
          peakDistance = 0;
        }
      }
    }

    return alerts;
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(trades: MATrade[]): any {
    if (trades.length === 0) {
      return {
        total_trades: 0,
        winning_trades: 0,
        losing_trades: 0,
        win_rate: 0.0,
        total_pnl: 0.0,
        total_return_percent: 0.0,
        avg_trade_duration: 0,
        max_drawdown: 0.0,
        sharpe_ratio: 0.0
      };
    }

    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => (t.pnl || 0) > 0).length;
    const losingTrades = trades.filter(t => (t.pnl || 0) < 0).length;
    const winRate = (winningTrades / totalTrades) * 100;

    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalReturnPercent = (totalPnl / this.initialCapital) * 100;

    const avgDuration = trades.reduce((sum, t) => sum + (t.duration_days || 0), 0) / totalTrades;

    // Calculate max drawdown
    let cumulativePnl = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (const trade of trades) {
      if (trade.pnl !== undefined) {
        cumulativePnl += trade.pnl;
        if (cumulativePnl > peak) {
          peak = cumulativePnl;
        }
        const drawdown = peak - cumulativePnl;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    return {
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: winRate,
      total_pnl: totalPnl,
      total_return_percent: totalReturnPercent,
      avg_trade_duration: avgDuration,
      max_drawdown: maxDrawdown,
      sharpe_ratio: this.calculateSharpeRatio(trades)
    };
  }

  /**
   * Calculate Sharpe ratio
   */
  private calculateSharpeRatio(trades: MATrade[]): number {
    if (trades.length < 2) return 0.0;

    const returns: number[] = [];
    for (const trade of trades) {
      if (trade.pnl !== undefined && trade.entry_price > 0) {
        const tradeReturn = (trade.pnl / (trade.entry_price * trade.shares)) * 100;
        returns.push(tradeReturn);
      }
    }

    if (returns.length < 2) return 0.0;

    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0.0;

    return Math.round((meanReturn / stdDev) * 100) / 100;
  }

  /**
   * Generate equity curve
   */
  private generateEquityCurve(data: StockData[], trades: MATrade[]): Array<[Date, number]> {
    const equityCurve: Array<[Date, number]> = [];
    let currentEquity = this.initialCapital;

    // Create a mapping of dates to trade PnL
    const tradePnlByDate = new Map<string, number>();
    for (const trade of trades) {
      if (trade.exit_date && trade.pnl !== undefined) {
        const dateStr = trade.exit_date.toISOString().split('T')[0];
        tradePnlByDate.set(dateStr, trade.pnl);
      }
    }

    for (const item of data) {
      const dateStr = item.date.toISOString().split('T')[0];
      if (tradePnlByDate.has(dateStr)) {
        currentEquity += tradePnlByDate.get(dateStr)!;
      }
      equityCurve.push([item.date, currentEquity]);
    }

    return equityCurve;
  }
}
