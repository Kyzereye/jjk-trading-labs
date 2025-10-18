import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';

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
export class TopPerformersComponent implements OnInit, AfterViewInit {
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  
  dataSource = new MatTableDataSource<TopPerformer>([]);
  allPerformers: TopPerformer[] = [];
  sortedData: TopPerformer[] = [];
  loading = false;
  minTrades = 5;
  timePeriod = 'ALL';
  totalAnalyzed = 0;
  latestAnalysisDate: string | null = null;
  pageSize = 20;
  
  timePeriods = [
    { value: 'ALL', label: 'All Data (3 Years)' },
    { value: '1Y', label: '1 Year' }
  ];
  
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

  ngAfterViewInit(): void {
    // Subscribe to sort changes to update sortedData
    if (this.sort) {
      this.sort.sortChange.subscribe(() => {
        this.updateSortedData();
      });
    }
  }
  
  updateSortedData(): void {
    // Get the currently sorted data from the dataSource
    this.sortedData = this.dataSource.sortData(this.dataSource.filteredData, this.sort);
  }

  loadTopPerformers(): void {
    this.loading = true;
    
    // Load all performers (no limit - we'll handle pagination client-side)
    this.apiService.getTopPerformers({
      limit: 1000, // Get all
      sort_by: 'total_return_pct',
      min_trades: this.minTrades,
      time_period: this.timePeriod
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.allPerformers = response.top_performers;
          
          // Set data
          this.dataSource.data = this.allPerformers;
          
          // Connect sort and paginator AFTER data is set
          setTimeout(() => {
            this.dataSource.sort = this.sort;
            this.dataSource.paginator = this.paginator;
            
            // Apply default sort
            if (this.sort) {
              this.sort.sort({
                id: 'total_return_pct',
                start: 'desc',
                disableClear: false
              });
            }
            
            // Update sorted data after sort is applied
            this.updateSortedData();
          }, 0);
          
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
          // Stats loaded successfully
        }
      },
      error: (error) => {
        console.error('Error loading stats:', error);
      }
    });
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

  getCurrentRank(performer: any): number {
    // Rank is ALWAYS based on Total Return % (descending), regardless of current sort
    // Sort all data by total_return_pct descending
    const rankedData = [...this.dataSource.data].sort((a, b) => b.total_return_pct - a.total_return_pct);
    
    // Find the performer's position in the ranked data
    const position = rankedData.findIndex((p: any) => p.symbol === performer.symbol);
    
    // Return 1-based rank
    return position + 1;
  }
  
  onTimePeriodChange(): void {
    this.loadTopPerformers();
  }
}
