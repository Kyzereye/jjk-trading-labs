import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ApiService } from '../../services/api.service';
import { SymbolDialogComponent } from './symbol-dialog/symbol-dialog.component';
import { ConfirmationService } from '../../services/confirmation.service';
import { SymbolAutocompleteService } from '../../services/symbol-autocomplete.service';
import { Observable } from 'rxjs';

interface StockSymbol {
  id: number;
  symbol: string;
  company_name: string;
  earliest_date?: string;
  latest_date?: string;
  data_points?: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-symbol-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatAutocompleteModule
  ],
  templateUrl: './symbol-management.component.html',
  styleUrls: ['./symbol-management.component.scss']
})
export class SymbolManagementComponent implements OnInit {
  displayedColumns: string[] = ['symbol', 'company_name', 'data_availability', 'actions'];
  symbols: StockSymbol[] = [];
  pagination: PaginationInfo = {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  };
  
  // Autocomplete
  searchControl = new FormControl('');
  filteredSymbols!: Observable<string[]>;
  
  loading: boolean = false;

  constructor(
    private apiService: ApiService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private confirmationService: ConfirmationService,
    private symbolAutocompleteService: SymbolAutocompleteService
  ) {}

  ngOnInit(): void {
    this.setupAutocomplete();
    this.loadSymbols();
  }

  setupAutocomplete(): void {
    this.filteredSymbols = this.symbolAutocompleteService.setupAutocomplete(this.searchControl);
  }

  loadSymbols(): void {
    this.loading = true;
    const searchValue = this.searchControl.value || '';
    this.apiService.getStockSymbolsManagement(
      this.pagination.page,
      this.pagination.limit,
      searchValue
    ).subscribe({
      next: (response: any) => {
        this.symbols = response.symbols;
        this.pagination = response.pagination;
        this.loading = false;
      },
      error: (error) => {
        this.showMessage('Failed to load stock symbols', 'error');
        this.loading = false;
      }
    });
  }

  onSearch(): void {
    this.pagination.page = 1; // Reset to first page on new search
    this.loadSymbols();
  }

  onSymbolSelected(symbol: string): void {
    this.searchControl.setValue(symbol);
    this.onSearch();
  }

  onPageChange(event: PageEvent): void {
    this.pagination.page = event.pageIndex + 1;
    this.pagination.limit = event.pageSize;
    this.loadSymbols();
  }

  openAddDialog(): void {
    const dialogRef = this.dialog.open(SymbolDialogComponent, {
      width: '500px',
      data: { mode: 'add' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.createSymbol(result);
      }
    });
  }

  openEditDialog(symbol: StockSymbol): void {
    const dialogRef = this.dialog.open(SymbolDialogComponent, {
      width: '500px',
      data: { mode: 'edit', symbol: { ...symbol } }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateSymbol(symbol.id, result);
      }
    });
  }

  createSymbol(data: { symbol: string; company_name: string }): void {
    this.loading = true;
    this.apiService.createStockSymbol(data.symbol, data.company_name).subscribe({
      next: (response: any) => {
        this.showMessage(response.message || 'Symbol created successfully', 'success');
        this.symbolAutocompleteService.refreshSymbols(); // Refresh autocomplete list
        this.loadSymbols();
      },
      error: (error) => {
        const message = error.error?.error || 'Failed to create symbol';
        this.showMessage(message, 'error');
        this.loading = false;
      }
    });
  }

  updateSymbol(id: number, data: { symbol: string; company_name: string }): void {
    this.loading = true;
    this.apiService.updateStockSymbol(id, data.symbol, data.company_name).subscribe({
      next: (response: any) => {
        this.showMessage(response.message || 'Symbol updated successfully', 'success');
        this.symbolAutocompleteService.refreshSymbols(); // Refresh autocomplete list
        this.loadSymbols();
      },
      error: (error) => {
        const message = error.error?.error || 'Failed to update symbol';
        this.showMessage(message, 'error');
        this.loading = false;
      }
    });
  }

  deleteSymbol(symbol: StockSymbol): void {
    // First check symbol usage
    this.apiService.getStockSymbolUsage(symbol.id).subscribe({
      next: (usageData: any) => {
        const usage = usageData.usage;
        let message = `Are you sure you want to delete <strong>${symbol.symbol}</strong> - ${symbol.company_name}?`;

        // Add usage information to the message
        if (usage.hasUsage) {
          message += '<br><br><strong>This will also delete:</strong><ul style="text-align: left; margin: 10px 0; padding-left: 20px;">';
          if (usage.stockData > 0) {
            message += `<li>${usage.stockData.toLocaleString()} stock data records</li>`;
          }
          if (usage.performance > 0) {
            message += `<li>${usage.performance} performance metrics</li>`;
          }
          if (usage.userTrades > 0) {
            message += `<li>${usage.userTrades} user trades</li>`;
          }
          if (usage.favorites > 0) {
            message += `<li>Removed from ${usage.favorites} user favorites list${usage.favorites > 1 ? 's' : ''}</li>`;
          }
          message += '</ul>';
        }

        message += '<br>This action cannot be undone.';

        // Show confirmation dialog with usage info
        this.confirmationService.confirm({
          title: 'Delete Stock Symbol',
          message,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          isDanger: true
        }).subscribe(confirmed => {
          if (confirmed) {
            this.loading = true;
            this.apiService.deleteStockSymbol(symbol.id).subscribe({
              next: (response: any) => {
                this.showMessage(response.message || 'Symbol deleted successfully', 'success');
                this.symbolAutocompleteService.refreshSymbols(); // Refresh autocomplete list
                this.loadSymbols();
              },
              error: (error) => {
                const message = error.error?.error || error.error?.details || 'Failed to delete symbol';
                this.showMessage(message, 'error');
                this.loading = false;
              }
            });
          }
        });
      },
      error: (error) => {
        this.showMessage('Failed to check symbol usage', 'error');
      }
    });
  }

  showMessage(message: string, type: 'success' | 'error'): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: type === 'success' ? 'snackbar-success' : 'snackbar-error',
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  /**
   * Calculate data availability display
   * Uses trading days (data_points) for classification, not calendar days
   */
  getDataAvailability(symbol: StockSymbol): { display: string; class: string } {
    if (!symbol.earliest_date || !symbol.latest_date || !symbol.data_points || symbol.data_points === 0) {
      return { display: 'No data', class: 'no-data' };
    }

    const tradingDays = symbol.data_points;
    const tradingDaysPerYear = 252; // Approximate US trading days per year
    
    // Calculate years and months based on trading days
    const years = Math.floor(tradingDays / tradingDaysPerYear);
    const remainingDays = tradingDays % tradingDaysPerYear;
    const months = Math.floor((remainingDays / tradingDaysPerYear) * 12);
    
    let displayText = '';
    if (years > 0) {
      displayText = `${years}y`;
      if (months > 0) {
        displayText += ` ${months}m`;
      }
    } else if (months > 0) {
      displayText = `${months}m`;
    } else {
      displayText = `${tradingDays}d`;
    }
    
    displayText += ` (${tradingDays} trading days)`;
    
    // Determine class based on trading days
    // 750+ trading days = full data (approximately 3 years)
    // 252 trading days/year × 1 year = 252 days
    let cssClass = 'full-data'; // 750+ trading days
    if (tradingDays < tradingDaysPerYear) {
      cssClass = 'low-data'; // < 1 year (< 252 days)
    } else if (tradingDays < 750) {
      cssClass = 'partial-data'; // 1-3 years (252-749 days)
    }
    
    return { display: displayText, class: cssClass };
  }
}
