import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { SymbolAutocompleteService } from '../../services/symbol-autocomplete.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subscription } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, switchMap, catchError, finalize } from 'rxjs/operators';
import { of } from 'rxjs';

export interface UserTrade {
  id?: number;
  position_type?: 'long' | 'short';
  symbol: string;
  entry_date: string;
  entry_price: number;
  shares: number;
  exit_date?: string | null;
  exit_price?: number | null;
  stop_loss?: number | null;
  target_price?: number | null;
  trade_notes?: string | null;
  status: 'open' | 'closed';
  pnl?: number | null;
  pnl_percent?: number | null;
}

@Component({
  selector: 'app-trade-tracker',
  templateUrl: './trade-tracker.component.html',
  styleUrls: ['./trade-tracker.component.scss']
})
export class TradeTrackerComponent implements OnInit, OnDestroy, OnChanges {
  openTrades: UserTrade[] = [];
  closedTrades: UserTrade[] = [];
  loading = false;
  showForm = false;
  editingTrade: UserTrade | null = null;
  tradeForm: FormGroup;
  displayedColumnsOpen: string[] = ['position_type', 'symbol', 'entry_date', 'entry_price', 'shares', 'stop_loss', 'target_price', 'current_pnl', 'actions'];
  displayedColumnsClosed: string[] = ['position_type', 'symbol', 'entry_date', 'exit_date', 'entry_price', 'exit_price', 'shares', 'pnl', 'pnl_percent', 'actions'];
  
  filteredSymbols!: Observable<string[]>;
  defaultStopLossMultiplier: number = 2.0;
  defaultATRPeriod: number = 14;
  currentATR: number = 0;
  currentSymbol: string = '';
  
  // Subscription management
  @Input() symbol: string | null = null;
  
  private subscriptions: Subscription = new Subscription();
  private symbolSubscription: Subscription | null = null;
  private entryPriceSubscription: Subscription | null = null;
  private fetchingATR = false;

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private symbolAutocompleteService: SymbolAutocompleteService,
    private route: ActivatedRoute
  ) {
    this.tradeForm = this.fb.group({
      position_type: ['long', Validators.required],
      symbol: ['', Validators.required],
      entry_date: ['', Validators.required],
      entry_price: ['', [Validators.required, Validators.min(0.01)]],
      shares: ['', [Validators.required, Validators.min(1)]],
      exit_date: [''],
      exit_price: ['', Validators.min(0.01)],
      stop_loss: ['', Validators.min(0.01)],
      target_price: ['', Validators.min(0.01)],
      trade_notes: ['']
    });
  }

  ngOnInit(): void {
    this.loadTrades();
    this.loadUserPreferences();
    this.setupSymbolAutocomplete();
    this.setupStopLossValidation();
    
    // Check for symbol input first
    if (this.symbol) {
      this.showAddForm();
      // Set the symbol after showing the form
      setTimeout(() => {
        this.tradeForm.patchValue({ symbol: this.symbol!.toUpperCase() });
      }, 0);
    }
    
    // Check for query parameter (fallback)
    this.route.queryParams.subscribe(params => {
      if (params['symbol'] && !this.symbol) {
        this.showAddForm();
        // Set the symbol after showing the form
        setTimeout(() => {
          this.tradeForm.patchValue({ symbol: params['symbol'].toUpperCase() });
        }, 0);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['symbol'] && changes['symbol'].currentValue) {
      const symbol = changes['symbol'].currentValue.toUpperCase();
      this.showAddForm();
      // Set the symbol after showing the form
      setTimeout(() => {
        this.tradeForm.patchValue({ symbol: symbol });
      }, 0);
    }
  }
  
  setupStopLossValidation(): void {
    // Re-validate stop loss when position type or entry price changes
    this.tradeForm.get('position_type')?.valueChanges.subscribe(() => {
      this.tradeForm.get('stop_loss')?.updateValueAndValidity();
    });
    
    this.tradeForm.get('entry_price')?.valueChanges.subscribe(() => {
      this.tradeForm.get('stop_loss')?.updateValueAndValidity();
    });
  }
  
  isStopLossValid(): boolean {
    const positionType = this.tradeForm.get('position_type')?.value;
    const entryPrice = parseFloat(this.tradeForm.get('entry_price')?.value);
    const stopLoss = parseFloat(this.tradeForm.get('stop_loss')?.value);
    
    if (!stopLoss || !entryPrice) {
      return true; // Don't show error if fields are empty
    }
    
    if (positionType === 'long') {
      // Long: stop loss must be BELOW entry
      return stopLoss < entryPrice;
    } else {
      // Short: stop loss must be ABOVE entry
      return stopLoss > entryPrice;
    }
  }
  
  getStopLossHint(): string {
    const positionType = this.tradeForm.get('position_type')?.value;
    if (positionType === 'short') {
      return 'Short positions: Stop loss must be ABOVE entry price';
    }
    return 'Long positions: Stop loss should be BELOW entry price';
  }

  ngOnDestroy(): void {
    // Clean up all subscriptions
    this.subscriptions.unsubscribe();
    if (this.symbolSubscription) {
      this.symbolSubscription.unsubscribe();
    }
    if (this.entryPriceSubscription) {
      this.entryPriceSubscription.unsubscribe();
    }
  }

  loadUserPreferences(): void {
    // Force fresh read from sessionStorage
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user?.preferences) {
          this.defaultStopLossMultiplier = parseFloat(user.preferences.default_atr_multiplier) || 2.0;
          this.defaultATRPeriod = user.preferences.default_atr_period || 14;
        }
      } catch (error) {
        // Use default preferences if parsing fails
      }
    }
  }

  setupSymbolAutocomplete(): void {
    this.filteredSymbols = this.symbolAutocompleteService.setupAutocomplete(
      this.tradeForm.get('symbol') as any
    );
  }

  calculateSuggestedStopLoss(entryPrice: number): number {
    // Use actual ATR if available, otherwise estimate
    const atr = this.currentATR > 0 ? this.currentATR : (entryPrice * 0.02);
    const stopLossPrice = entryPrice - (atr * this.defaultStopLossMultiplier);
    return Math.max(0.01, stopLossPrice);
  }

  fetchATRForSymbol(symbol: string): void {
    if (!symbol || symbol.length === 0) return;
    
    const upperSymbol = symbol.toUpperCase();
    
    // Don't fetch if already fetching or if symbol hasn't changed
    if (this.fetchingATR || upperSymbol === this.currentSymbol) {
      return;
    }
    
    // Validate symbol exists in available symbols
    const availableSymbols = this.symbolAutocompleteService.getSymbols();
    if (availableSymbols.length > 0 && !availableSymbols.includes(upperSymbol)) {
      return;
    }
    
    this.fetchingATR = true;
    
    this.apiService.getStockData(upperSymbol, 30, false, 'ema')
      .pipe(
        finalize(() => {
          this.fetchingATR = false;
        }),
        catchError((error) => {
          this.currentATR = 0;
          return of({ success: false, data: [] });
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data && response.data.length > this.defaultATRPeriod) {
            const atr = this.calculateATR(response.data, this.defaultATRPeriod);
            this.currentATR = atr;
            this.currentSymbol = upperSymbol;
            
            const entryPrice = this.tradeForm.get('entry_price')?.value;
            if (entryPrice && entryPrice > 0) {
              const suggestedStopLoss = this.calculateSuggestedStopLoss(entryPrice);
              this.tradeForm.patchValue({ stop_loss: suggestedStopLoss.toFixed(2) }, { emitEvent: false });
            }
          }
        }
      });
  }

  calculateATR(stockData: any[], period: number): number {
    if (stockData.length < period + 1) return 0;
    
    const trueRanges: number[] = [];
    
    for (let i = 1; i < stockData.length; i++) {
      const high = stockData[i].high;
      const low = stockData[i].low;
      const prevClose = stockData[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      
      trueRanges.push(tr);
    }
    
    const recentTRs = trueRanges.slice(-period);
    const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / recentTRs.length;
    
    return atr;
  }

  validateExitDate(): void {
    const entryDate = this.tradeForm.get('entry_date')?.value;
    const exitDate = this.tradeForm.get('exit_date')?.value;
    
    if (entryDate && exitDate) {
      const entry = new Date(entryDate);
      const exit = new Date(exitDate);
      
      if (exit < entry) {
        this.tradeForm.get('exit_date')?.setErrors({ invalidDate: true });
      }
    }
  }

  getMinExitDate(): string {
    const entryDate = this.tradeForm.get('entry_date')?.value;
    return entryDate || '';
  }

  loadTrades(): void {
    this.loading = true;
    
    this.apiService.getUserTrades('open').subscribe({
      next: (response) => {
        if (response.success) {
          this.openTrades = response.trades;
        }
      },
      error: (error) => {
        this.snackBar.open('Failed to load open trades', 'Close', { duration: 3000 });
      }
    });

    this.apiService.getUserTrades('closed').subscribe({
      next: (response) => {
        if (response.success) {
          this.closedTrades = response.trades;
        }
        this.loading = false;
      },
      error: (error) => {
        this.snackBar.open('Failed to load closed trades', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  showAddForm(): void {
    this.showForm = true;
    this.editingTrade = null;
    
    // Store the symbol before resetting
    const currentSymbol = this.tradeForm.get('symbol')?.value;
    
    this.tradeForm.reset();
    
    // Restore the symbol if it was set
    if (currentSymbol) {
      this.tradeForm.patchValue({ symbol: currentSymbol });
    }
    
    this.currentATR = 0;
    this.currentSymbol = '';
    this.fetchingATR = false;
    
    this.loadUserPreferences();
    
    // Clean up old subscriptions before creating new ones
    if (this.symbolSubscription) {
      this.symbolSubscription.unsubscribe();
    }
    if (this.entryPriceSubscription) {
      this.entryPriceSubscription.unsubscribe();
    }
    
    // Setup symbol change listener with debouncing
    this.symbolSubscription = this.tradeForm.get('symbol')!.valueChanges
      .pipe(
        debounceTime(500),  // Wait 500ms after user stops typing
        distinctUntilChanged(),  // Only emit if value changed
        map(value => value ? value.trim().toUpperCase() : '')
      )
      .subscribe(symbol => {
        if (symbol && symbol.length >= 1) {
          this.fetchATRForSymbol(symbol);
        }
      });
    
    // Setup entry price change listener
    this.entryPriceSubscription = this.tradeForm.get('entry_price')!.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(entryPrice => {
        const symbol = this.tradeForm.get('symbol')?.value;
        
        if (symbol && symbol.length > 0 && entryPrice && entryPrice > 0) {
          const suggestedStopLoss = this.calculateSuggestedStopLoss(entryPrice);
          this.tradeForm.patchValue({ stop_loss: suggestedStopLoss.toFixed(2) }, { emitEvent: false });
        } else {
          this.tradeForm.patchValue({ stop_loss: '' }, { emitEvent: false });
        }
      });
  }

  editTrade(trade: UserTrade): void {
    this.showForm = true;
    this.editingTrade = trade;
    this.currentATR = 0;
    this.currentSymbol = '';
    this.fetchingATR = false;
    
    // Clean up old subscriptions before creating new ones
    if (this.symbolSubscription) {
      this.symbolSubscription.unsubscribe();
    }
    if (this.entryPriceSubscription) {
      this.entryPriceSubscription.unsubscribe();
    }
    
    this.tradeForm.patchValue({
      position_type: trade.position_type || 'long',
      symbol: trade.symbol,
      entry_date: trade.entry_date,
      entry_price: trade.entry_price,
      shares: trade.shares,
      exit_date: trade.exit_date || '',
      exit_price: trade.exit_price || '',
      stop_loss: trade.stop_loss || '',
      target_price: trade.target_price || '',
      trade_notes: trade.trade_notes || ''
    });
    
    // Setup symbol change listener with debouncing
    this.symbolSubscription = this.tradeForm.get('symbol')!.valueChanges
      .pipe(
        debounceTime(500),  // Wait 500ms after user stops typing
        distinctUntilChanged(),  // Only emit if value changed
        map(value => value ? value.trim().toUpperCase() : '')
      )
      .subscribe(symbol => {
        if (symbol && symbol.length >= 1) {
          this.fetchATRForSymbol(symbol);
        }
      });
    
    // Setup entry price change listener
    this.entryPriceSubscription = this.tradeForm.get('entry_price')!.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(entryPrice => {
        const symbol = this.tradeForm.get('symbol')?.value;
        
        if (symbol && symbol.length > 0 && entryPrice && entryPrice > 0) {
          const suggestedStopLoss = this.calculateSuggestedStopLoss(entryPrice);
          this.tradeForm.patchValue({ stop_loss: suggestedStopLoss.toFixed(2) }, { emitEvent: false });
        }
      });
    
    // Fetch ATR for initial symbol
    if (trade.symbol) {
      this.fetchATRForSymbol(trade.symbol);
    }
  }

  deleteTrade(trade: UserTrade): void {
    if (confirm(`Are you sure you want to delete this ${trade.symbol} trade?`)) {
      this.apiService.deleteUserTrade(trade.id!).subscribe({
        next: (response) => {
          this.snackBar.open('Trade deleted successfully', 'Close', { duration: 2000 });
          this.loadTrades();
        },
        error: (error) => {
          this.snackBar.open('Failed to delete trade', 'Close', { duration: 3000 });
        }
      });
    }
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingTrade = null;
    this.tradeForm.reset();
    
    // Clean up subscriptions when closing form
    if (this.symbolSubscription) {
      this.symbolSubscription.unsubscribe();
      this.symbolSubscription = null;
    }
    if (this.entryPriceSubscription) {
      this.entryPriceSubscription.unsubscribe();
      this.entryPriceSubscription = null;
    }
    
    this.currentATR = 0;
    this.currentSymbol = '';
    this.fetchingATR = false;
  }

  saveTrade(): void {
    if (this.tradeForm.valid) {
      const tradeData = this.tradeForm.value;

      if (this.editingTrade) {
        this.apiService.updateUserTrade(this.editingTrade.id!, tradeData).subscribe({
          next: (response) => {
            this.snackBar.open('Trade updated successfully', 'Close', { duration: 2000 });
            this.showForm = false;
            this.editingTrade = null;
            this.tradeForm.reset();
            
            // Clean up subscriptions
            if (this.symbolSubscription) {
              this.symbolSubscription.unsubscribe();
              this.symbolSubscription = null;
            }
            if (this.entryPriceSubscription) {
              this.entryPriceSubscription.unsubscribe();
              this.entryPriceSubscription = null;
            }
            
            this.loadTrades();
          },
          error: (error) => {
            this.snackBar.open('Failed to update trade', 'Close', { duration: 3000 });
          }
        });
      } else {
        this.apiService.createUserTrade(tradeData).subscribe({
          next: (response) => {
            this.snackBar.open('Trade added successfully', 'Close', { duration: 2000 });
            this.showForm = false;
            this.tradeForm.reset();
            
            // Clean up subscriptions
            if (this.symbolSubscription) {
              this.symbolSubscription.unsubscribe();
              this.symbolSubscription = null;
            }
            if (this.entryPriceSubscription) {
              this.entryPriceSubscription.unsubscribe();
              this.entryPriceSubscription = null;
            }
            
            this.loadTrades();
          },
          error: (error) => {
            this.snackBar.open('Failed to add trade', 'Close', { duration: 3000 });
          }
        });
      }
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }

  getPnLClass(value: number): string {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return '';
  }

  calculateCurrentPnL(trade: UserTrade): number {
    return 0;
  }
}

