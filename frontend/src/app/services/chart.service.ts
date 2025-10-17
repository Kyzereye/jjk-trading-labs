import { Injectable } from '@angular/core';
import { createChart, IChartApi, ISeriesApi, CandlestickData, LineData, Time } from 'lightweight-charts';

export interface ChartData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma_21?: number;
  ma_50?: number;
}

export interface SignalData {
  date: string;
  signal_type: 'BUY' | 'SELL';
  price: number;
  reasoning: string;
}

export interface AlertData {
  date: string;
  price: number;
  distance_percent: number;
  reasoning: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChartService {
  private chart: IChartApi | null = null;
  private candlestickSeries: ISeriesApi<'Candlestick'> | null = null;
  private ma21Series: ISeriesApi<'Line'> | null = null;
  private ma50Series: ISeriesApi<'Line'> | null = null;

  constructor() {}

  /**
   * Initialize chart in the given container
   */
  initializeChart(container: HTMLElement): IChartApi {
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: 500,
      layout: {
        background: { color: '#1a1a1a' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#485563',
      },
      timeScale: {
        borderColor: '#485563',
      },
    });

    // Create candlestick series
    this.candlestickSeries = this.chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Create MA series
    this.ma21Series = this.chart.addLineSeries({
      color: '#ffffff',
      lineWidth: 1,
    });

    this.ma50Series = this.chart.addLineSeries({
      color: '#2196f3',
      lineWidth: 1,
    });

    return this.chart;
  }

  /**
   * Update chart with new data
   */
  updateChart(
    stockData: ChartData[],
    signals: SignalData[] = [],
    alerts: AlertData[] = []
  ): void {
    if (!this.chart || !this.candlestickSeries || !this.ma21Series || !this.ma50Series) {
      return;
    }

    // Prepare candlestick data
    const candlestickData: CandlestickData[] = stockData
      .map((data) => ({
        time: data.date.split('T')[0] as Time,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
      }))
      .sort((a, b) => (a.time as string).localeCompare(b.time as string));

    // Prepare MA data
    const ma21Data: LineData[] = stockData
      .filter(data => data.ma_21 !== null && data.ma_21 !== undefined)
      .map((data) => ({
        time: data.date.split('T')[0] as Time,
        value: data.ma_21!,
      }))
      .sort((a, b) => (a.time as string).localeCompare(b.time as string));

    const ma50Data: LineData[] = stockData
      .filter(data => data.ma_50 !== null && data.ma_50 !== undefined)
      .map((data) => ({
        time: data.date.split('T')[0] as Time,
        value: data.ma_50!,
      }))
      .sort((a, b) => (a.time as string).localeCompare(b.time as string));

    // Prepare signal markers
    const signalMarkers: any[] = [];
    
    // Add buy/sell signals
    signals.forEach(signal => {
      const dateStr = signal.date.includes('T') ? signal.date.split('T')[0] : signal.date;
      const marker = {
        time: dateStr as Time,
        position: signal.signal_type === 'BUY' ? 'belowBar' as const : 'aboveBar' as const,
        color: signal.signal_type === 'BUY' ? '#00ff00' : '#ff0000',
        shape: signal.signal_type === 'BUY' ? 'arrowUp' as const : 'arrowDown' as const,
        text: signal.signal_type === 'BUY' ? 'Entry' : 'Exit',
      };
      signalMarkers.push(marker);
    });

    // Add mean reversion alerts
    alerts.forEach(alert => {
      const dateStr = alert.date.includes('T') ? alert.date.split('T')[0] : alert.date;
      const alertMarker = {
        time: dateStr as Time,
        position: 'aboveBar' as const,
        color: '#ffa500',
        shape: 'circle' as const,
        text: `Alert: ${alert.distance_percent.toFixed(1)}%`,
      };
      signalMarkers.push(alertMarker);
    });

    // Update series
    this.candlestickSeries.setData(candlestickData);
    this.ma21Series.setData(ma21Data);
    this.ma50Series.setData(ma50Data);
    
    // Sort markers by time
    signalMarkers.sort((a, b) => (a.time as string).localeCompare(b.time as string));
    
    // Update signal markers
    this.candlestickSeries.setMarkers(signalMarkers);

    // Fit content
    this.chart.timeScale().fitContent();
  }

  /**
   * Resize chart
   */
  resizeChart(width: number, height: number): void {
    if (this.chart) {
      this.chart.applyOptions({
        width,
        height
      });
    }
  }

  /**
   * Destroy chart
   */
  destroyChart(): void {
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
      this.candlestickSeries = null;
      this.ma21Series = null;
      this.ma50Series = null;
    }
  }

  /**
   * Get chart instance
   */
  getChart(): IChartApi | null {
    return this.chart;
  }
}
