/**
 * Moving Average Trading Engine
 * Ported from Python to TypeScript
 */
export interface MASignal {
    date: Date;
    signal_type: 'BUY' | 'SELL' | 'SELL_SHORT' | 'BUY_TO_COVER';
    price: number;
    ma_21: number;
    ma_50: number;
    reasoning: string;
    confidence: number;
    atr?: number;
    trailing_stop?: number;
    position_type?: 'long' | 'short';
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
    position_type: 'long' | 'short';
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
export declare class MATradingEngine {
    private initialCapital;
    private atrPeriod;
    private atrMultiplierLong;
    private atrMultiplierShort;
    private maType;
    private ma21Period;
    private ma50Period;
    private meanReversionThreshold;
    private positionSizingLong;
    private positionSizingShort;
    private strategyMode;
    constructor(initialCapital?: number, atrPeriod?: number, atrMultiplierLong?: number, atrMultiplierShort?: number, maType?: string, customFastMa?: number, customSlowMa?: number, meanReversionThreshold?: number, positionSizingLong?: number, positionSizingShort?: number, strategyMode?: 'long' | 'short' | 'both');
    /**
     * Calculate Exponential Moving Average
     */
    private calculateEMA;
    /**
     * Calculate Simple Moving Average
     */
    private calculateSMA;
    /**
     * Calculate Moving Average (EMA or SMA)
     */
    private calculateMA;
    /**
     * Calculate Average True Range (ATR)
     */
    private calculateATR;
    /**
     * Run Moving Average trading analysis
     */
    runAnalysis(data: StockData[], symbol: string): Promise<MAResults>;
    /**
     * Generate Enhanced Moving Average trading signals with re-entry logic
     */
    private generateLongSignals;
    /**
     * Generate SHORT trading signals (mirrored from long logic)
     */
    private generateShortSignals;
    /**
     * Execute trades based on signals
     */
    private executeTrades;
    /**
     * Calculate running P&L, running capital, and drawdown for each trade
     */
    private calculateRunningMetrics;
    /**
     * Generate mean reversion alerts
     */
    private generateMeanReversionAlerts;
    /**
     * Calculate performance metrics
     */
    private calculatePerformanceMetrics;
    /**
     * Calculate Sharpe ratio
     */
    private calculateSharpeRatio;
    /**
     * Generate equity curve
     */
    private generateEquityCurve;
}
