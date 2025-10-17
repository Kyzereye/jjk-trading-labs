import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subscription } from 'rxjs';
import { map, startWith, debounceTime, distinctUntilChanged, switchMap, catchError, finalize } from 'rxjs/operators';
import { of } from 'rxjs';

export interface UserTrade {
  id?: number;
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
export class TradeTrackerComponent implements OnInit, OnDestroy {
  openTrades: UserTrade[] = [];
  closedTrades: UserTrade[] = [];
  loading = false;
  showForm = false;
  editingTrade: UserTrade | null = null;
  tradeForm: FormGroup;
  displayedColumnsOpen: string[] = ['symbol', 'entry_date', 'entry_price', 'shares', 'stop_loss', 'target_price', 'current_pnl', 'actions'];
  displayedColumnsClosed: string[] = ['symbol', 'entry_date', 'exit_date', 'entry_price', 'exit_price', 'shares', 'pnl', 'pnl_percent', 'actions'];
  
  availableSymbols: string[] = [];
  filteredSymbols!: Observable<string[]>;
  defaultStopLossMultiplier: number = 2.0;
  defaultATRPeriod: number = 14;
  currentATR: number = 0;
  currentSymbol: string = '';
  
  // Subscription management
  private subscriptions: Subscription = new Subscription();
  private symbolSubscription: Subscription | null = null;
  private entryPriceSubscription: Subscription | null = null;
  private fetchingATR = false;

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.tradeForm = this.fb.group({
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
    this.loadSymbols();
    this.loadUserPreferences();
    this.setupSymbolAutocomplete();
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

  loadSymbols(): void {
    this.apiService.getSymbols().subscribe({
      next: (response) => {
        if (response.success) {
          this.availableSymbols = response.symbols;
        }
      },
      error: (error) => {
        console.error('Error loading symbols:', error);
      }
    });
  }

  loadUserPreferences(): void {
    // Force fresh read from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user?.preferences) {
          this.defaultStopLossMultiplier = parseFloat(user.preferences.default_atr_multiplier) || 2.0;
          this.defaultATRPeriod = user.preferences.default_atr_period || 14;
          console.log('Loaded preferences - ATR Multiplier:', this.defaultStopLossMultiplier, 'ATR Period:', this.defaultATRPeriod);
        }
      } catch (error) {
        console.error('Error parsing user preferences:', error);
      }
    }
  }

  setupSymbolAutocomplete(): void {
    this.filteredSymbols = this.tradeForm.get('symbol')!.valueChanges.pipe(
      startWith(''),
      map(value => this.filterSymbols(value || ''))
    );
  }

  private filterSymbols(value: string): string[] {
    const filterValue = value.toUpperCase();
    return this.availableSymbols.filter(symbol => 
      symbol.startsWith(filterValue)
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
    if (this.availableSymbols.length > 0 && !this.availableSymbols.includes(upperSymbol)) {
      console.log(`Symbol ${upperSymbol} not found in available symbols`);
      return;
    }
    
    this.fetchingATR = true;
    console.log(`Fetching ATR for ${upperSymbol}...`);
    
    this.apiService.getStockData(upperSymbol, 30, false, 'ema')
      .pipe(
        finalize(() => {
          this.fetchingATR = false;
        }),
        catchError((error) => {
          console.error('Error fetching ATR data:', error);
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
            console.log(`ATR for ${upperSymbol}: $${atr.toFixed(2)}`);
            
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
        console.error('Error loading open trades:', error);
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
        console.error('Error loading closed trades:', error);
        this.loading = false;
      }
    });
  }

  showAddForm(): void {
    this.showForm = true;
    this.editingTrade = null;
    this.tradeForm.reset();
    this.currentATR = 0;
    this.currentSymbol = '';
    this.fetchingATR = false;
    
    this.loadUserPreferences();
    console.log('Opening add form with ATR multiplier:', this.defaultStopLossMultiplier);
    
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
          const atr = this.currentATR > 0 ? this.currentATR : (entryPrice * 0.02);
          const suggestedStopLoss = this.calculateSuggestedStopLoss(entryPrice);
          console.log(`Symbol: ${symbol}, Entry Price: $${entryPrice}, ATR: $${atr.toFixed(2)} (${this.currentATR > 0 ? 'ACTUAL' : 'ESTIMATED'}), Stop Loss PRICE: $${suggestedStopLoss.toFixed(2)}`);
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
          const atr = this.currentATR > 0 ? this.currentATR : (entryPrice * 0.02);
          const suggestedStopLoss = this.calculateSuggestedStopLoss(entryPrice);
          console.log(`Symbol: ${symbol}, Entry Price: $${entryPrice}, ATR: $${atr.toFixed(2)} (${this.currentATR > 0 ? 'ACTUAL' : 'ESTIMATED'}), Stop Loss PRICE: $${suggestedStopLoss.toFixed(2)}`);
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
          console.error('Error deleting trade:', error);
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
            console.error('Error updating trade:', error);
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
            console.error('Error creating trade:', error);
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

