declare module 'yahoo-finance2' {
  interface ChartOptions {
    period1: Date;
    period2?: Date;
    interval?: '1d' | string;
    return?: 'array' | 'object';
  }
  interface ChartQuote {
    date: Date | number | { raw: number };
    open?: number | null | { raw: number };
    high?: number | null | { raw: number };
    low?: number | null | { raw: number };
    close?: number | null | { raw: number };
    volume?: number | null | { raw: number };
  }
  interface ChartResult {
    quotes: ChartQuote[];
  }
  const yahooFinance: {
    chart(symbol: string, options: ChartOptions): Promise<ChartResult>;
    suppressNotices(ids: string[]): void;
  };
  export default yahooFinance;
}
