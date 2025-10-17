import { Injectable } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class SymbolAutocompleteService {
  private symbolsSubject = new BehaviorSubject<string[]>([]);
  public symbols$ = this.symbolsSubject.asObservable();

  constructor(private apiService: ApiService) {
    this.loadSymbols();
  }

  /**
   * Load all available symbols from the API
   */
  private loadSymbols(): void {
    this.apiService.getSymbols().subscribe({
      next: (response) => {
        if (response.success) {
          this.symbolsSubject.next(response.symbols);
        }
      },
      error: (error) => {
        console.error('Error loading symbols for autocomplete:', error);
      }
    });
  }

  /**
   * Refresh the symbol list (call after adding/deleting symbols)
   */
  refreshSymbols(): void {
    this.loadSymbols();
  }

  /**
   * Get current symbol list
   */
  getSymbols(): string[] {
    return this.symbolsSubject.value;
  }

  /**
   * Filter symbols based on input value
   */
  filterSymbols(value: string, symbols: string[] = this.getSymbols()): string[] {
    const filterValue = value.toUpperCase().trim();
    if (!filterValue) {
      return []; // Return empty array if no input (don't show all symbols)
    }
    return symbols.filter(symbol => symbol.startsWith(filterValue));
  }

  /**
   * Setup autocomplete for a FormControl
   * Returns an Observable of filtered symbols
   */
  setupAutocomplete(control: FormControl): Observable<string[]> {
    return control.valueChanges.pipe(
      startWith(''),
      map(value => this.filterSymbols(value || ''))
    );
  }
}
