import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SymbolAutocompleteService } from '../../services/symbol-autocomplete.service';
import { Observable } from 'rxjs';

interface OptimizationResult {
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
  symbol: string;
  date_range: string;
}

interface SymbolOptimization {
  symbol: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  bestPair: OptimizationResult | null;
  topPairs: OptimizationResult[];
  error?: string;
}

@Component({
  selector: 'app-ma-optimization',
  templateUrl: './ma-optimization.component.html',
  styleUrls: ['./ma-optimization.component.scss']
})
export class MaOptimizationComponent implements OnInit {
  optimizationForm!: FormGroup;
  loading = false;
  results: SymbolOptimization[] = [];
  filteredSymbols!: Observable<string[]>;
  userFavorites: string[] = [];
  loadingFavorites = false;
  
  maTypes = [
    { value: 'ema', label: 'EMA (Exponential Moving Average)' },
    { value: 'sma', label: 'SMA (Simple Moving Average)' }
  ];
  
  displayedColumns: string[] = ['rank', 'fast_ma', 'slow_ma', 'ma_distance', 'total_return', 'sharpe_ratio', 'win_rate', 'total_trades'];
  
  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private snackBar: MatSnackBar,
    private symbolAutocompleteService: SymbolAutocompleteService
  ) {}
  
  ngOnInit(): void {
    this.loadUserFavorites();
    
    this.optimizationForm = this.fb.group({
      symbols: ['', Validators.required],
      days: [365, [Validators.required, Validators.min(90)]],
      fastRangeMin: [5, [Validators.required, Validators.min(2)]],
      fastRangeMax: [30, [Validators.required, Validators.min(5)]],
      slowRangeMin: [20, [Validators.required, Validators.min(10)]],
      slowRangeMax: [100, [Validators.required, Validators.min(20)]],
      minDistance: [10, [Validators.required, Validators.min(5)]],
      maType: ['ema', Validators.required],
      initialCapital: [100000, [Validators.required, Validators.min(1000)]],
      atrPeriod: [14, [Validators.required, Validators.min(7)]],
      atrMultiplier: [2.0, [Validators.required, Validators.min(1.0)]]
    });
    
    this.setupSymbolAutocomplete();
  }
  
  setupSymbolAutocomplete(): void {
    this.filteredSymbols = this.symbolAutocompleteService.setupAutocomplete(
      this.optimizationForm.get('symbols') as any
    );
  }
  
  loadUserFavorites(): void {
    this.loadingFavorites = true;
    this.apiService.getFavorites().subscribe({
      next: (response) => {
        if (response.success && response.favorites) {
          this.userFavorites = response.favorites;
        }
        this.loadingFavorites = false;
      },
      error: (error) => {
        console.error('Error loading favorites:', error);
        this.loadingFavorites = false;
      }
    });
  }
  
  loadFavoritesIntoForm(): void {
    if (this.userFavorites.length === 0) {
      this.snackBar.open('No favorite stocks found. Add some favorites first!', 'Close', { duration: 3000 });
      return;
    }
    
    // Set favorites as comma-separated string in the form
    this.optimizationForm.patchValue({
      symbols: this.userFavorites.join(', ')
    });
    
    this.snackBar.open(`Loaded ${this.userFavorites.length} favorite stocks`, 'Close', { duration: 2000 });
  }
  
  async runOptimization(): Promise<void> {
    if (this.optimizationForm.invalid) {
      this.snackBar.open('Please fill in all required fields correctly', 'Close', { duration: 3000 });
      return;
    }
    
    const formValue = this.optimizationForm.value;
    const symbolsInput = formValue.symbols.trim();
    
    // Parse symbols (comma or space separated)
    const symbols = symbolsInput
      .split(/[,\s]+/)
      .map((s: string) => s.trim().toUpperCase())
      .filter((s: string) => s.length > 0);
    
    if (symbols.length === 0) {
      this.snackBar.open('Please enter at least one stock symbol', 'Close', { duration: 3000 });
      return;
    }
    
    this.loading = true;
    this.results = symbols.map((symbol: string) => ({
      symbol,
      status: 'pending' as const,
      bestPair: null,
      topPairs: []
    }));
    
    // Run optimizations sequentially
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      this.results[i].status = 'running';
      
      try {
        const request = {
          days: formValue.days,
          fast_range: `${formValue.fastRangeMin},${formValue.fastRangeMax}`,
          slow_range: `${formValue.slowRangeMin},${formValue.slowRangeMax}`,
          min_distance: formValue.minDistance,
          initial_capital: formValue.initialCapital,
          atr_period: formValue.atrPeriod,
          atr_multiplier: formValue.atrMultiplier,
          ma_type: formValue.maType
        };
        
        const response = await this.apiService.optimizeMA(symbol, request).toPromise();
        
        if (response) {
          this.results[i].status = 'complete';
          // Add symbol to results
          this.results[i].bestPair = response.best_pair ? {
            ...response.best_pair,
            symbol
          } : null;
          this.results[i].topPairs = (response.top_5_pairs || []).map(pair => ({
            ...pair,
            symbol
          }));
          
          this.snackBar.open(`✓ ${symbol} optimization complete`, 'Close', { duration: 2000 });
        }
        
      } catch (error: any) {
        console.error(`Error optimizing ${symbol}:`, error);
        this.results[i].status = 'error';
        this.results[i].error = error.error?.message || 'Optimization failed';
        this.snackBar.open(`✗ ${symbol} optimization failed`, 'Close', { duration: 3000 });
      }
    }
    
    this.loading = false;
  }
  
  getStatusColor(status: string): string {
    switch (status) {
      case 'complete': return '#51cbce';
      case 'running': return '#fbc658';
      case 'error': return '#ef8157';
      default: return '#9a9a9a';
    }
  }
  
  getStatusIcon(status: string): string {
    switch (status) {
      case 'complete': return 'check_circle';
      case 'running': return 'hourglass_empty';
      case 'error': return 'error';
      default: return 'schedule';
    }
  }
  
  formatPercent(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }
  
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }
  
  reset(): void {
    this.results = [];
    this.optimizationForm.reset({
      days: 365,
      fastRangeMin: 5,
      fastRangeMax: 30,
      slowRangeMin: 20,
      slowRangeMax: 100,
      minDistance: 10,
      maType: 'ema',
      initialCapital: 100000,
      atrPeriod: 14,
      atrMultiplier: 2.0
    });
  }
}
