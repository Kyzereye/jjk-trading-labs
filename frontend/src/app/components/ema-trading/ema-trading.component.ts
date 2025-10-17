import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService, EMAAnalysisRequest, EMAAnalysisResponse } from '../../services/api.service';
import { ChartService } from '../../services/chart.service';
import { AuthService } from '../../services/auth.service';
import { SymbolAutocompleteService } from '../../services/symbol-autocomplete.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-ema-trading',
  templateUrl: './ema-trading.component.html',
  styleUrls: ['./ema-trading.component.scss']
})
export class EmaTradingComponent implements OnInit, OnDestroy {
  @ViewChild('chartContainer', { static: false }) chartContainer!: ElementRef;

  analysisForm: FormGroup;
  filteredSymbols!: Observable<string[]>;
  loading = false;
  results: EMAAnalysisResponse | null = null;
  stockData: any[] = [];
  activeTab = 0;
  displayedColumns: string[] = [];
  favoriteStocks: string[] = [];
  currentSymbol: string = '';
  combinedSignals: any[] = [];

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private chartService: ChartService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private router: Router,
    private route: ActivatedRoute,
    private symbolAutocompleteService: SymbolAutocompleteService
  ) {
    this.analysisForm = this.fb.group({
      symbol: ['', Validators.required],
      days: [365, [Validators.min(1), Validators.max(2000)]],
      atrMultiplier: [2.0, [Validators.min(0.5), Validators.max(5.0)]],
      maType: ['ema', Validators.required],
      meanReversionThreshold: [10.0, [Validators.min(3), Validators.max(15)]]
    });
  }

  ngOnInit(): void {
    this.setupSymbolAutocomplete();
    this.setUserPreferences();
    this.updateDisplayedColumns();
    this.loadFavorites();
    
    // Check for query parameters (symbol from dashboard)
    this.route.queryParams.subscribe(params => {
      if (params['symbol']) {
        const symbol = params['symbol'].toUpperCase();
        this.analysisForm.patchValue({ symbol });
        // Auto-run analysis after a short delay
        setTimeout(() => {
          this.runAnalysis();
        }, 500);
      }
    });
    
    // Listen for navigation to this route to refresh preferences
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event) => {
        if ((event as NavigationEnd).url === '/trading') {
          // Reload preferences when navigating back to trading page
          this.setUserPreferences();
          this.updateDisplayedColumns();
        }
      });
  }

  ngOnDestroy(): void {
    this.chartService.destroyChart();
  }

  private setupSymbolAutocomplete(): void {
    this.filteredSymbols = this.symbolAutocompleteService.setupAutocomplete(
      this.analysisForm.get('symbol') as any
    );
  }

  private setUserPreferences(): void {
    // Force fresh read from localStorage
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    
    if (user?.preferences) {
      this.analysisForm.patchValue({
        days: user.preferences.default_days || 365,
        atrMultiplier: user.preferences.default_atr_multiplier || 2.0,
        maType: user.preferences.default_ma_type || 'ema',
        meanReversionThreshold: user.preferences.mean_reversion_threshold || 10.0
      });
    }
  }

  private updateDisplayedColumns(): void {
    const user = this.authService.getCurrentUser();
    const columnPrefs = user?.preferences?.trades_columns;
    
    // Default columns if no preferences
    const defaultColumns = {
      entry_date: true,
      exit_date: true,
      entry_price: true,
      exit_price: true,
      exit_reason: true,
      shares: true,
      pnl: true,
      pnl_percent: true,
      running_pnl: true,
      running_capital: true,
      drawdown: true,
      duration: true
    };
    
    const columns = columnPrefs || defaultColumns;
    
    // Build displayed columns array based on preferences
    this.displayedColumns = [];
    if (columns.entry_date) this.displayedColumns.push('entry_date');
    if (columns.exit_date) this.displayedColumns.push('exit_date');
    if (columns.entry_price) this.displayedColumns.push('entry_price');
    if (columns.exit_price) this.displayedColumns.push('exit_price');
    if (columns.exit_reason) this.displayedColumns.push('exit_reason');
    if (columns.shares) this.displayedColumns.push('shares');
    if (columns.pnl) this.displayedColumns.push('pnl');
    if (columns.pnl_percent) this.displayedColumns.push('pnl_percent');
    if (columns.running_pnl) this.displayedColumns.push('running_pnl');
    if (columns.running_capital) this.displayedColumns.push('running_capital');
    if (columns.drawdown) this.displayedColumns.push('drawdown');
    if (columns.duration) this.displayedColumns.push('duration');
  }

  runAnalysis(): void {
    if (this.analysisForm.valid) {
      this.loading = true;
      const formValue = this.analysisForm.value;
      const user = this.authService.getCurrentUser();

      const request: EMAAnalysisRequest = {
        symbol: formValue.symbol.toUpperCase(),
        initial_capital: user?.preferences?.default_initial_capital || 100000,
        days: formValue.days,
        atr_period: user?.preferences?.default_atr_period || 14,
        atr_multiplier: formValue.atrMultiplier,
        mean_reversion_threshold: formValue.meanReversionThreshold,
        position_sizing_percentage: user?.preferences?.position_sizing_percentage || 5.0,
        ma_type: formValue.maType
      };

      this.apiService.analyzeEMA(request).subscribe({
        next: (response) => {
          this.results = response;
          this.loading = false;
          this.combineCombinedSignals();
          this.loadChartData();
        },
        error: (error) => {
          this.loading = false;
          console.error('Analysis failed:', error);
        }
      });
    }
  }

  private loadChartData(): void {
    if (!this.results) return;

    const formValue = this.analysisForm.value;
    this.apiService.getStockData(
      formValue.symbol,
      formValue.days,
      true,
      formValue.maType
    ).subscribe({
      next: (response) => {
        this.stockData = response.data;
        this.updateChart();
      },
      error: (error) => {
        console.error('Failed to load chart data:', error);
      }
    });
  }

  private updateChart(): void {
    if (this.activeTab === 2 && this.chartContainer && this.results) {
      // Initialize chart if not already done
      if (!this.chartService.getChart()) {
        this.chartService.initializeChart(this.chartContainer.nativeElement);
      }

      // Update chart with data
      this.chartService.updateChart(
        this.stockData,
        this.results.signals,
        this.results.mean_reversion_alerts
      );
    }
  }

  private combineCombinedSignals(): void {
    if (!this.results) return;

    // Combine regular signals and mean reversion alerts
    const signals = this.results.signals.map(signal => ({
      date: signal.date,
      signal_type: signal.signal_type,
      price: signal.price,
      reasoning: signal.reasoning,
      confidence: signal.confidence,
      ma_21: signal.ma_21,
      distance_percent: null,
      type: 'SIGNAL'
    }));

    const alerts = this.results.mean_reversion_alerts.map(alert => ({
      date: alert.date,
      signal_type: 'ALERT',
      price: alert.price,
      reasoning: alert.reasoning,
      confidence: null,
      ma_21: alert.ma_21,
      distance_percent: alert.distance_percent,
      type: 'ALERT'
    }));

    // Combine and sort by date (newest first)
    this.combinedSignals = [...signals, ...alerts].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }

  onTabChange(index: number): void {
    this.activeTab = index;
    if (index === 2) {
      // Chart tab - update chart
      setTimeout(() => {
        this.updateChart();
      }, 100);
    }
  }

  getPerformanceColor(value: number): string {
    if (value > 0) return 'success';
    if (value < 0) return 'error';
    return 'default';
  }

  getPnLClass(value: number): string {
    if (value > 0) return 'pnl-positive';
    if (value < 0) return 'pnl-negative';
    return 'pnl-neutral';
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

  loadFavorites(): void {
    this.apiService.getFavorites().subscribe({
      next: (response) => {
        if (response.success) {
          this.favoriteStocks = response.favorites;
        }
      },
      error: (error) => {
        console.error('Error loading favorites:', error);
      }
    });
  }

  isInFavorites(symbol: string): boolean {
    if (!symbol) return false;
    return this.favoriteStocks.includes(symbol.toUpperCase());
  }

  toggleFavorite(): void {
    if (!this.results) return;
    
    const upperSymbol = this.results.symbol.toUpperCase();
    
    if (this.isInFavorites(upperSymbol)) {
      // Remove from favorites
      this.apiService.removeFromFavorites(upperSymbol).subscribe({
        next: (response) => {
          this.favoriteStocks = response.favorites;
          this.snackBar.open(`${upperSymbol} removed from favorites`, 'Close', { duration: 2000 });
        },
        error: (error) => {
          console.error('Failed to remove from favorites:', error);
        }
      });
    } else {
      // Add to favorites
      this.apiService.addToFavorites(upperSymbol).subscribe({
        next: (response) => {
          this.favoriteStocks = response.favorites;
          this.snackBar.open(`${upperSymbol} added to favorites`, 'Close', { duration: 2000 });
        },
        error: (error) => {
          console.error('Failed to add to favorites:', error);
        }
      });
    }
  }
}
