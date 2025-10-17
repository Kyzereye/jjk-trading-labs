import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { MatSnackBar } from '@angular/material/snack-bar';

export interface TopPerformer {
  symbol: string;
  company_name: string;
  total_return_pct: number;
  total_pnl: number;
  win_rate: number;
  total_trades: number;
  sharpe_ratio: number;
  analysis_date: string;
}

@Component({
  selector: 'app-top-performers',
  templateUrl: './top-performers.component.html',
  styleUrls: ['./top-performers.component.scss']
})
export class TopPerformersComponent implements OnInit {
  topPerformers: TopPerformer[] = [];
  loading = false;
  sortBy = 'total_return_pct';
  limit = 20;
  minTrades = 5;
  totalAnalyzed = 0;
  latestAnalysisDate: string | null = null;
  
  displayedColumns: string[] = ['rank', 'symbol', 'company_name', 'total_return_pct', 'win_rate', 'sharpe_ratio', 'total_trades', 'actions'];

  constructor(
    private apiService: ApiService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadTopPerformers();
    this.loadStats();
  }

  loadTopPerformers(): void {
    this.loading = true;
    
    this.apiService.getTopPerformers({
      limit: this.limit,
      sort_by: this.sortBy,
      min_trades: this.minTrades
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.topPerformers = response.top_performers;
          this.totalAnalyzed = response.total_analyzed;
          this.latestAnalysisDate = response.latest_analysis_date;
        } else {
          this.snackBar.open(response.message || 'No data available', 'Close', { duration: 5000 });
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading top performers:', error);
        this.snackBar.open('Failed to load top performers. Run data fetch script first.', 'Close', { duration: 5000 });
        this.loading = false;
      }
    });
  }

  loadStats(): void {
    this.apiService.getAnalysisStats().subscribe({
      next: (response) => {
        if (response.success) {
          console.log('Analysis stats:', response.stats);
        }
      },
      error: (error) => {
        console.error('Error loading stats:', error);
      }
    });
  }

  changeSortCriteria(criteria: string): void {
    this.sortBy = criteria;
    this.loadTopPerformers();
  }

  analyzeStock(symbol: string): void {
    this.router.navigate(['/trading'], { queryParams: { symbol } });
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

  getPerformanceColor(value: number): string {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }

  getRankClass(rank: number): string {
    if (rank === 1) return 'rank-gold';
    if (rank === 2) return 'rank-silver';
    if (rank === 3) return 'rank-bronze';
    return '';
  }
}
