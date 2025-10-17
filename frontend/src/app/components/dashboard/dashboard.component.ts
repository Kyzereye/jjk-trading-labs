import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { MatSnackBar } from '@angular/material/snack-bar';

interface FavoriteStock {
  symbol: string;
  latest_price?: number;
  latest_date?: string;
  ma_21?: number;
  ma_50?: number;
  distance_from_ma21?: number;
  distance_from_ma50?: number;
  status?: string;
  status_color?: string;
  last_signal?: string;
  last_signal_color?: string;
  actionable?: boolean;
}

interface RecentAnalysis {
  symbol: string;
  date: string;
  total_return: number;
  win_rate: number;
  total_trades: number;
}

interface DashboardStats {
  totalAnalyses: number;
  bestPerformingStock: string;
  averageWinRate: number;
  totalTrades: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  user: any = null;
  loading = true;
  favoriteStocks: FavoriteStock[] = [];
  recentAnalyses: RecentAnalysis[] = [];
  dashboardStats: DashboardStats = {
    totalAnalyses: 0,
    bestPerformingStock: 'N/A',
    averageWinRate: 0,
    totalTrades: 0
  };

  // Default favorite stocks for now
  defaultFavorites = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA'];

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.loading = true;
    
    // Load favorite stocks with default list
    this.loadFavoriteStocks();
    
    // Load recent analyses (will implement backend endpoint)
    // this.loadRecentAnalyses();
    
    // Load dashboard stats (will implement backend endpoint)
    // this.loadDashboardStats();
    
    this.loading = false;
  }

  loadFavoriteStocks(): void {
    this.apiService.getFavoritesStatus().subscribe({
      next: (response) => {
        if (response.success && response.favorites_status && response.favorites_status.length > 0) {
          this.favoriteStocks = response.favorites_status;
        } else {
          // No favorites - show empty state
          this.favoriteStocks = [];
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading favorites status:', error);
        this.favoriteStocks = [];
        this.loading = false;
      }
    });
  }

  loadDefaultFavoritesStatus(): void {
    // For default favorites, fetch their status individually
    const promises = this.defaultFavorites.map(symbol => 
      this.apiService.getStockData(symbol, 60, false, 'ema').toPromise()
    );

    Promise.all(promises).then(responses => {
      this.favoriteStocks = this.defaultFavorites.map((symbol, index) => {
        const response = responses[index];
        if (response && response.success && response.data && response.data.length > 21) {
          const data = response.data;
          const latest = data[data.length - 1];
          const closePrices = data.map((d: any) => d.close);
          
          const ma21 = this.calculateEMA(closePrices, 21);
          const ma50 = this.calculateEMA(closePrices, 50);
          const currentMA21 = ma21[ma21.length - 1];
          const currentMA50 = ma50[ma50.length - 1];
          
          return {
            symbol,
            latest_price: latest.close,
            ma_21: currentMA21,
            ma_50: currentMA50,
            status: 'Add to favorites for personalized tracking',
            status_color: 'neutral',
            last_signal: 'WATCHING',
            last_signal_color: 'neutral'
          };
        }
        return {
          symbol,
          status: 'No data available',
          status_color: 'neutral'
        };
      });
      this.loading = false;
    }).catch(error => {
      console.error('Error loading default favorites data:', error);
      this.favoriteStocks = this.defaultFavorites.map(symbol => ({
        symbol,
        status: 'Add to favorites for live tracking',
        status_color: 'neutral'
      }));
      this.loading = false;
    });
  }

  calculateEMA(data: number[], period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);
    
    let sum = 0;
    for (let i = 0; i < period && i < data.length; i++) {
      sum += data[i];
    }
    result[period - 1] = sum / period;
    
    for (let i = period; i < data.length; i++) {
      const ema = (data[i] - result[i - 1]) * multiplier + result[i - 1];
      result[i] = ema;
    }
    
    return result;
  }

  runQuickAnalysis(symbol: string): void {
    this.router.navigate(['/trading'], { 
      queryParams: { symbol } 
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }

  formatPercent(value: number): string {
    return `${value.toFixed(2)}%`;
  }

  getChangeClass(value: number): string {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }
}

