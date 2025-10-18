import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface EMAAnalysisRequest {
  symbol: string;
  initial_capital?: number;
  days?: number;
  atr_period?: number;
  atr_multiplier?: number;
  mean_reversion_threshold?: number;
  position_sizing_percentage?: number;
  ma_type?: string;
}

export interface EMAAnalysisResponse {
  symbol: string;
  start_date: string;
  end_date: string;
  total_days: number;
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
  trades: Array<{
    entry_date: string;
    exit_date: string | null;
    entry_price: number;
    exit_price: number | null;
    entry_signal: string;
    exit_signal: string;
    shares: number;
    pnl: number | null;
    pnl_percent: number | null;
    duration_days: number | null;
    exit_reason: string | null;
    is_reentry: boolean;
    reentry_count: number;
  }>;
  signals: Array<{
    date: string;
    signal_type: 'BUY' | 'SELL';
    price: number;
    ma_21: number;
    ma_50: number;
    reasoning: string;
    confidence: number;
    atr: number | null;
    trailing_stop: number | null;
  }>;
  mean_reversion_alerts: Array<{
    date: string;
    price: number;
    ma_21: number;
    distance_percent: number;
    reasoning: string;
  }>;
  equity_curve: Array<{
    date: string;
    equity: number;
  }>;
}

export interface OptimizationRequest {
  symbol?: string; // Optional - passed as separate parameter to optimizeMA
  days?: number;
  fast_range?: string;
  slow_range?: string;
  min_distance?: number;
  initial_capital?: number;
  atr_period?: number;
  atr_multiplier?: number;
  ma_type?: string;
}

export interface OptimizationResponse {
  symbol: string;
  optimization_date: string;
  parameters_used: any;
  best_pair: {
    fast_ma: number;
    slow_ma: number;
    ma_distance: number;
    total_return_percent: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    total_trades: number;
    avg_trade_duration: number;
    date_range: string;
  } | null;
  top_5_pairs: Array<{
    fast_ma: number;
    slow_ma: number;
    ma_distance: number;
    total_return_percent: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    total_trades: number;
    avg_trade_duration: number;
    date_range: string;
  }>;
  total_pairs_tested: number;
  summary_stats: {
    avg_return: number;
    max_return: number;
    min_return: number;
    avg_sharpe: number;
    avg_trades: number;
  };
}

export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma_21?: number;
  ma_50?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly API_URL = 'http://localhost:2222/api';

  constructor(private http: HttpClient) {}

  // Health check
  getHealth(): Observable<any> {
    return this.http.get(`${this.API_URL}/health`);
  }

  // Get available stock symbols
  getSymbols(): Observable<{ success: boolean; symbols: string[] }> {
    return this.http.get<{ success: boolean; symbols: string[] }>(`${this.API_URL}/symbols`);
  }

  // Get stock data for charting
  getStockData(symbol: string, days: number = 365, includeEma: boolean = false, maType: string = 'ema'): Observable<{ success: boolean; symbol: string; data: StockData[] }> {
    let params = new HttpParams()
      .set('days', days.toString())
      .set('include_ema', includeEma.toString())
      .set('ma_type', maType);

    return this.http.get<{ success: boolean; symbol: string; data: StockData[] }>(`${this.API_URL}/stocks/${symbol}`, { params });
  }

  // EMA Trading Analysis
  analyzeEMA(request: EMAAnalysisRequest): Observable<EMAAnalysisResponse> {
    return this.http.post<EMAAnalysisResponse>(`${this.API_URL}/ema/analyze`, request);
  }

  getEMASignals(symbol: string, days: number = 100): Observable<any> {
    const params = new HttpParams().set('days', days.toString());
    return this.http.get(`${this.API_URL}/ema/signals/${symbol}`, { params });
  }

  getEMASummary(symbol: string, initialCapital: number = 100000, days: number = 365): Observable<any> {
    const params = new HttpParams()
      .set('initial_capital', initialCapital.toString())
      .set('days', days.toString());
    return this.http.get(`${this.API_URL}/ema/summary/${symbol}`, { params });
  }

  getTopPerformers(request: any): Observable<any> {
    return this.http.post(`${this.API_URL}/ema/top-performers`, request);
  }

  getAnalysisStats(): Observable<any> {
    return this.http.get(`${this.API_URL}/ema/analysis-stats`);
  }

  // MA Optimization
  optimizeMA(symbol: string, request: OptimizationRequest): Observable<OptimizationResponse> {
    let params = new HttpParams();
    
    if (request.days) params = params.set('days', request.days.toString());
    if (request.fast_range) params = params.set('fast_range', request.fast_range);
    if (request.slow_range) params = params.set('slow_range', request.slow_range);
    if (request.min_distance) params = params.set('min_distance', request.min_distance.toString());
    if (request.initial_capital) params = params.set('initial_capital', request.initial_capital.toString());
    if (request.atr_period) params = params.set('atr_period', request.atr_period.toString());
    if (request.atr_multiplier) params = params.set('atr_multiplier', request.atr_multiplier.toString());
    if (request.ma_type) params = params.set('ma_type', request.ma_type);

    return this.http.get<OptimizationResponse>(`${this.API_URL}/optimization/optimize/${symbol}`, { params });
  }

  compareMAPairs(symbol: string, pairs: string, days: number = 365, initialCapital: number = 100000, atrPeriod: number = 14, atrMultiplier: number = 2.0, maType: string = 'ema'): Observable<any> {
    const params = new HttpParams()
      .set('pairs', pairs)
      .set('days', days.toString())
      .set('initial_capital', initialCapital.toString())
      .set('atr_period', atrPeriod.toString())
      .set('atr_multiplier', atrMultiplier.toString())
      .set('ma_type', maType);

    return this.http.get(`${this.API_URL}/optimization/compare-pairs/${symbol}`, { params });
  }

  getHeatmapData(symbol: string, days: number = 365, fastRange: string = '5,30', slowRange: string = '20,100', minDistance: number = 10, metric: string = 'return'): Observable<any> {
    const params = new HttpParams()
      .set('days', days.toString())
      .set('fast_range', fastRange)
      .set('slow_range', slowRange)
      .set('min_distance', minDistance.toString())
      .set('metric', metric);

    return this.http.get(`${this.API_URL}/optimization/heatmap/${symbol}`, { params });
  }

  // User Profile Methods
  getUserProfile(): Observable<any> {
    return this.http.get(`${this.API_URL}/auth/profile`);
  }

  updateUserProfile(profileData: { name?: string; email?: string }): Observable<any> {
    return this.http.put(`${this.API_URL}/auth/profile`, profileData);
  }

  updateUserPreferences(preferences: any): Observable<any> {
    return this.http.put(`${this.API_URL}/auth/preferences`, preferences);
  }

  changePassword(passwordData: { currentPassword: string; newPassword: string }): Observable<any> {
    return this.http.put(`${this.API_URL}/auth/change-password`, {
      current_password: passwordData.currentPassword,
      new_password: passwordData.newPassword
    });
  }

  // Favorites Methods
  getFavorites(): Observable<{ success: boolean; favorites: string[] }> {
    return this.http.get<{ success: boolean; favorites: string[] }>(`${this.API_URL}/auth/favorites`);
  }

  getFavoritesStatus(): Observable<any> {
    return this.http.get(`${this.API_URL}/auth/favorites-status`);
  }

  addToFavorites(symbol: string): Observable<{ success: boolean; favorites: string[] }> {
    return this.http.post<{ success: boolean; favorites: string[] }>(`${this.API_URL}/auth/favorites/${symbol}`, {});
  }

  removeFromFavorites(symbol: string): Observable<{ success: boolean; favorites: string[] }> {
    return this.http.delete<{ success: boolean; favorites: string[] }>(`${this.API_URL}/auth/favorites/${symbol}`);
  }

  // User Trades Methods
  getUserTrades(status?: string): Observable<any> {
    const params = status ? new HttpParams().set('status', status) : new HttpParams();
    return this.http.get(`${this.API_URL}/trades`, { params });
  }

  getUserTrade(id: number): Observable<any> {
    return this.http.get(`${this.API_URL}/trades/${id}`);
  }

  createUserTrade(tradeData: any): Observable<any> {
    return this.http.post(`${this.API_URL}/trades`, tradeData);
  }

  updateUserTrade(id: number, tradeData: any): Observable<any> {
    return this.http.put(`${this.API_URL}/trades/${id}`, tradeData);
  }

  deleteUserTrade(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/trades/${id}`);
  }

  getTradeStats(): Observable<any> {
    return this.http.get(`${this.API_URL}/trades/stats/summary`);
  }

  // Stock Symbols Management
  getStockSymbolsManagement(page: number = 1, limit: number = 50, search: string = ''): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    
    if (search) {
      params = params.set('search', search);
    }

    return this.http.get(`${this.API_URL}/symbols/manage`, { params });
  }

  getStockSymbolById(id: number): Observable<any> {
    return this.http.get(`${this.API_URL}/symbols/manage/${id}`);
  }

  getStockSymbolUsage(id: number): Observable<any> {
    return this.http.get(`${this.API_URL}/symbols/manage/${id}/usage`);
  }

  createStockSymbol(symbol: string, companyName: string): Observable<any> {
    return this.http.post(`${this.API_URL}/symbols/manage`, {
      symbol,
      company_name: companyName
    });
  }

  updateStockSymbol(id: number, symbol: string, companyName: string): Observable<any> {
    return this.http.put(`${this.API_URL}/symbols/manage/${id}`, {
      symbol,
      company_name: companyName
    });
  }

  deleteStockSymbol(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/symbols/manage/${id}`);
  }
}
