import { Component, OnInit, ViewChild, ChangeDetectorRef, AfterViewInit, NgZone } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TradeTrackerComponent } from '../trade-tracker/trade-tracker.component';
import { FormControl } from '@angular/forms';
import { Observable } from 'rxjs';
import { SymbolAutocompleteService } from '../../services/symbol-autocomplete.service';

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

interface TradingAlert {
  id: number;
  symbol: string;
  signalType: 'entry' | 'exit' | 'mean_reversion';
  signalDirection: 'long' | 'short';
  price: number;
  ma21Value?: number;
  ma50Value?: number;
  deviationPercent?: number;
  signalDate: string;
  signalTime?: string;
  createdAt: string;
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
export class DashboardComponent implements OnInit, AfterViewInit {
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
  
  // Symbol from query parameter for trade tracker
  tradeSymbol: string | null = null;
  
  // Reference to trade tracker component
  @ViewChild(TradeTrackerComponent) tradeTrackerComponent!: TradeTrackerComponent;
  
  // Panel expansion state
  tradeTrackerPanelExpanded = false;
  
  // Expose Math to template
  Math = Math;

  // Alerts properties
  alerts: TradingAlert[] = [];
  alertsLoading = false;
  selectedPeriod = '3days';
  shouldExpandOnInit = false;
  private _initialized = false;
  
  // Symbol alerts cache
  symbolAlertsCache: { [symbol: string]: TradingAlert[] } = {};
  
  // Alert tabs
  selectedAlertTab: 'favorites' | 'discovery' | 'all' = 'favorites';
  discoveryStocks: string[] = []; // Symbols from discovery API
  discoveryLoading = false;
  
  // Filters
  selectedDirection: 'all' | 'long' | 'short' = 'all';
  selectedType: 'all' | 'entry' | 'exit' | 'mean_reversion' = 'all';
  selectedDay: string = 'all';
  minPrice: number | null = null;
  maxPrice: number | null = null;
  symbolSearchControl = new FormControl('');
  filteredSymbols$!: Observable<string[]>;
  showFilters = false;
  
  // Pagination
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  
  // Expandable alerts
  expandedAlertId: number | null = null;
  
  // Get available days from alerts
  get availableDays(): string[] {
    const uniqueDays = new Set<string>();
    this.alerts.forEach(alert => {
      uniqueDays.add(alert.signalDate);
    });
    return Array.from(uniqueDays).sort((a, b) => b.localeCompare(a)); // Sort newest first
  }
  
  // Get discovery alerts - stocks from API based on performance metrics
  get discoveryAlerts(): TradingAlert[] {
    if (this.discoveryStocks.length === 0) {
      return [];
    }
    
    const discoverySymbolsSet = new Set(this.discoveryStocks.map(s => s.toUpperCase()));
    
    // Return alerts for discovery stocks only
    return this.alerts.filter(alert => 
      discoverySymbolsSet.has(alert.symbol.toUpperCase())
    );
  }
  
  // Computed filtered alerts based on selected tab
  get filteredAlerts(): TradingAlert[] {
    const symbolFilter = this.symbolSearchControl.value?.toUpperCase() || '';
    const favoriteSymbols = this.favoriteStocks.map(stock => stock.symbol.toUpperCase());
    
    // Start with alerts based on selected tab
    let baseAlerts: TradingAlert[];
    switch (this.selectedAlertTab) {
      case 'favorites':
        baseAlerts = this.alerts.filter(alert => 
          favoriteSymbols.includes(alert.symbol.toUpperCase())
        );
        break;
      case 'discovery':
        baseAlerts = this.discoveryAlerts;
        break;
      case 'all':
      default:
        baseAlerts = this.alerts;
        break;
    }
    
    // Apply additional filters
    return baseAlerts.filter(alert => {
      const directionMatch = this.selectedDirection === 'all' || alert.signalDirection === this.selectedDirection;
      const typeMatch = this.selectedType === 'all' || alert.signalType === this.selectedType;
      const dayMatch = this.selectedDay === 'all' || alert.signalDate === this.selectedDay;
      const symbolMatch = !symbolFilter || alert.symbol.toUpperCase().includes(symbolFilter);
      const minPriceMatch = this.minPrice === null || alert.price >= this.minPrice;
      const maxPriceMatch = this.maxPrice === null || alert.price <= this.maxPrice;
      return directionMatch && typeMatch && dayMatch && symbolMatch && minPriceMatch && maxPriceMatch;
    });
  }
  
  // Get favorites that don't have alerts in the current filtered set
  get favoritesWithoutAlerts(): string[] {
    if (this.selectedAlertTab !== 'favorites' || this.favoriteStocks.length === 0) {
      return [];
    }
    
    const favoriteSymbols = this.favoriteStocks.map(stock => stock.symbol.toUpperCase());
    const alertSymbols = new Set(this.filteredAlerts.map(alert => alert.symbol.toUpperCase()));
    
    return favoriteSymbols.filter(symbol => !alertSymbols.has(symbol));
  }
  
  // Get count of favorites with alerts
  get favoriteAlertsCount(): { showing: number, total: number } {
    if (this.selectedAlertTab !== 'favorites' || this.favoriteStocks.length === 0) {
      return { showing: 0, total: 0 };
    }
    
    const favoriteSymbols = this.favoriteStocks.map(stock => stock.symbol.toUpperCase());
    const alertSymbols = new Set(this.filteredAlerts.map(alert => alert.symbol.toUpperCase()));
    const showing = favoriteSymbols.filter(symbol => alertSymbols.has(symbol)).length;
    
    return { showing, total: this.favoriteStocks.length };
  }
  
  // Paginated alerts (with page validation)
  get paginatedAlerts(): TradingAlert[] {
    // Reset to first page if current page is out of bounds
    if (this.currentPage >= Math.ceil(this.filteredAlerts.length / this.pageSize) && this.currentPage > 0) {
      this.currentPage = 0;
    }
    const startIndex = this.currentPage * this.pageSize;
    return this.filteredAlerts.slice(startIndex, startIndex + this.pageSize);
  }
  
  // Total number of pages
  get totalPages(): number {
    return Math.ceil(this.filteredAlerts.length / this.pageSize);
  }
  
  // Group alerts by date for divider display
  get groupedAlertsByDate(): { date: string, alerts: TradingAlert[] }[] {
    const grouped = new Map<string, TradingAlert[]>();
    
    for (const alert of this.paginatedAlerts) {
      const dateKey = alert.signalDate;
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(alert);
    }
    
    return Array.from(grouped.entries()).map(([date, alerts]) => ({
      date,
      alerts
    })).sort((a, b) => b.date.localeCompare(a.date)); // Sort newest first
  }
  
  // Pagination methods
  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
    }
  }
  
  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
    }
  }
  
  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
    }
  }
  
  onPageSizeChange(newSize: any): void {
    this.pageSize = parseInt(newSize);
    this.currentPage = 0; // Reset to first page when changing page size
  }

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private symbolAutocompleteService: SymbolAutocompleteService
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();
    this.loadDashboardData();
    
    // Setup symbol autocomplete
    this.filteredSymbols$ = this.symbolAutocompleteService.setupAutocomplete(this.symbolSearchControl);
    
    // Check for symbol query parameter
    this.route.queryParams.subscribe(params => {
      if (params['symbol']) {
        this.tradeSymbol = params['symbol'].toUpperCase();
        // Set flag to expand panel after view init
        this.shouldExpandOnInit = true;
      }
    });
  }

  ngAfterViewInit(): void {
    // Mark as initialized
    this._initialized = true;
    
    // Handle panel expansion after view is initialized
    if (this.shouldExpandOnInit) {
      this.ngZone.runOutsideAngular(() => {
        setTimeout(() => {
          this.ngZone.run(() => {
            this.tradeTrackerPanelExpanded = true;
          });
        }, 100);
      });
    }
  }

  loadDashboardData(): void {
    this.loading = true;
    
    // Load favorite stocks with default list
    this.loadFavoriteStocks();
    
    // Load trading alerts
    this.loadAlerts();
    
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

  showAddTradeForm(): void {
    if (this.tradeTrackerComponent) {
      this.tradeTrackerComponent.showAddForm();
      // Expand panel after a short delay to avoid change detection issues
      this.ngZone.runOutsideAngular(() => {
        setTimeout(() => {
          this.ngZone.run(() => {
            this.tradeTrackerPanelExpanded = true;
          });
        }, 50);
      });
    }
  }

  isTradeFormVisible(): boolean {
    return this.tradeTrackerComponent ? this.tradeTrackerComponent.showForm : false;
  }

  hasTrades(): boolean {
    if (!this.tradeTrackerComponent) return false;
    return (this.tradeTrackerComponent.openTrades.length + this.tradeTrackerComponent.closedTrades.length) > 0;
  }

  shouldExpandTradeTracker(): boolean {
    // Don't check anything until after initialization to avoid change detection issues
    if (!this._initialized) {
      return false;
    }
    
    // Always return true if we explicitly want to expand
    if (this.tradeTrackerPanelExpanded) {
      return true;
    }
    
    // Check if component is ready before accessing its properties
    if (!this.tradeTrackerComponent) {
      return false;
    }
    
    // Check for trades
    const hasTrades = (this.tradeTrackerComponent.openTrades.length + this.tradeTrackerComponent.closedTrades.length) > 0;
    
    // Check if form is visible
    const isFormVisible = this.tradeTrackerComponent.showForm;
    
    return hasTrades || isFormVisible;
  }

  getTradeCount(): number {
    if (!this.tradeTrackerComponent) return 0;
    return this.tradeTrackerComponent.openTrades.length + this.tradeTrackerComponent.closedTrades.length;
  }

  loadAlerts(): void {
    this.alertsLoading = true;
    
    this.apiService.getAlerts(this.selectedPeriod).subscribe({
      next: (response) => {
        if (response.success) {
          this.alerts = response.data || [];
        } else {
          this.alerts = [];
        }
        this.alertsLoading = false;
      },
      error: (error) => {
        console.error('Error loading alerts:', error);
        this.alerts = [];
        this.alertsLoading = false;
        this.snackBar.open('Failed to load alerts', 'Close', { duration: 3000 });
      }
    });
  }

  onPeriodChange(): void {
    this.loadAlerts();
  }
  
  resetFilters(): void {
    this.selectedDirection = 'all';
    this.selectedType = 'all';
    this.selectedDay = 'all';
    this.minPrice = null;
    this.maxPrice = null;
    this.symbolSearchControl.setValue('');
    this.currentPage = 0;
    
    // Manually trigger change detection to update the view
    this.cdr.markForCheck();
  }
  
  selectAlertTab(tab: 'favorites' | 'discovery' | 'all'): void {
    this.selectedAlertTab = tab;
    this.currentPage = 0; // Reset to first page when changing tabs
    
    // Always reload discovery stocks when discovery tab is selected (in case settings changed)
    if (tab === 'discovery') {
      this.loadDiscoveryStocks();
    }
    
    this.cdr.detectChanges();
  }
  
  loadDiscoveryStocks(): void {
    this.discoveryLoading = true;
    
    this.apiService.getDiscoveryStocks().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.discoveryStocks = response.data.map((stock: any) => stock.symbol);
        } else {
          this.discoveryStocks = [];
        }
        this.discoveryLoading = false;
      },
      error: (error) => {
        console.error('Error loading discovery stocks:', error);
        this.discoveryStocks = [];
        this.discoveryLoading = false;
      }
    });
  }
  
  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }
  
  onAlertClick(alert: TradingAlert): void {
    if (this.expandedAlertId === alert.id) {
      this.expandedAlertId = null;
    } else {
      this.expandedAlertId = alert.id;
      
      // Fetch all alerts for this symbol if not in cache
      if (!this.symbolAlertsCache[alert.symbol]) {
        this.apiService.getAlertsForSymbol(alert.symbol).subscribe({
          next: (response) => {
            if (response.success && response.data) {
              this.symbolAlertsCache[alert.symbol] = response.data;
            }
          },
          error: (error) => {
            console.error('Error fetching alerts for symbol:', error);
            this.symbolAlertsCache[alert.symbol] = [];
          }
        });
      }
    }
  }
  
  isExpanded(alertId: number): boolean {
    return this.expandedAlertId === alertId;
  }
  
  getAlertsForSymbol(symbol: string): TradingAlert[] {
    // Return cached alerts for this symbol, or empty array if not loaded yet
    return this.symbolAlertsCache[symbol] || [];
  }
}


