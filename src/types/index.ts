import type { SectorKey } from '@/lib/sectors';

// 市場タイプ
export type Market = 'US' | 'JP' | 'FX';
export type WatchlistKey = 'main' | 'sub1' | 'sub2' | 'sub3' | 'sub4';

// 取引タイプ
export type TransactionType = 'buy' | 'sell' | 'dividend';

// ポートフォリオ（口座）
export interface Portfolio {
  id: string;
  name: string;
  broker: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// 保有銘柄
export interface Holding {
  id: string;
  portfolio_id: string;
  symbol: string;
  name?: string;
  market: Market;
  shares: number;
  avg_cost: number;
  sort_order: number;
  sector?: string;
  memo?: string;
  created_at: string;
  updated_at: string;
}

// 取引履歴
export interface Transaction {
  id: string;
  portfolio_id: string;
  symbol: string;
  market: Market;
  type: TransactionType;
  shares: number;
  price: number;
  total_amount: number;
  fees: number;
  transaction_date: string;
  memo?: string;
  created_at: string;
}

// 株価情報
export interface StockPrice {
  symbol: string;
  market: Market;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  currency: string;
  updated_at: string;
}

// 財務・バリュエーション指標
export interface FundamentalMetrics {
  symbol: string;
  market: Market;
  currency?: string;
  updated_at: string;
  source: 'yahoo_finance' | 'yahoo_finance_nasdaq';
  market_cap?: number;
  trailing_pe?: number;
  forward_pe?: number;
  pbr?: number;
  psr?: number;
  revenue?: number;
  operating_margin?: number;
  net_margin?: number;
  roe?: number;
  roa?: number;
  revenue_growth?: number;
  operating_income_growth?: number;
  eps_growth?: number;
  equity_ratio?: number;
  interest_bearing_debt?: number;
  net_cash?: number;
  free_cash_flow?: number;
  dividend_yield?: number;
  payout_ratio?: number;
  share_buyback?: number;
  next_earnings_date?: string;
}

// 為替レート
export interface ExchangeRate {
  pair: string;
  rate: number;
  updated_at: string;
}

// ニュース
export interface NewsItem {
  id: string;
  symbol: string;
  title: string;
  summary?: string;
  source: string;
  url: string;
  image_url?: string;
  published_at: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

// ウォッチリスト
export interface WatchlistItem {
  id: string;
  symbol: string;
  name?: string;
  market: Market;
  list_key: WatchlistKey;
  sort_order: number;
  /** セクターキー（@/lib/sectors の SectorKey） */
  sector?: string;
  target_price?: number;
  memo?: string;
  created_at: string;
  updated_at: string;
}

// 事前登録ティッカー
export interface TickerPreset {
  id: string;
  symbol: string;
  market: Market;
  name?: string;
  created_at: string;
  updated_at: string;
}

// トレードアイデア
export interface TradeIdea {
  id: string;
  symbol: string;
  market: Market;
  note: string;
  created_at: string;
  updated_at: string;
}

// 保有銘柄 + 株価情報（表示用）
export interface HoldingWithPrice extends Holding {
  price_status: 'live' | 'missing' | 'cash';
  current_price?: number;
  current_value?: number;
  current_value_jpy?: number;
  profit_loss?: number;
  profit_loss_percent?: number;
  change_percent?: number;
}

// ポートフォリオサマリー
export interface PortfolioSummary {
  total_value_jpy: number;
  total_cost_jpy: number;
  total_profit_loss: number;
  total_profit_loss_percent: number;
  us_stock_value_usd: number;
  us_stock_value_jpy: number;
  jp_stock_value_jpy: number;
  fx_value_usd: number;
  fx_value_jpy: number;
  cash_value_usd: number;
  cash_value_jpy: number;
  daily_change: number;
  daily_change_percent: number;
  missing_price_count: number;
}

// セクター配分
export interface SectorAllocation {
  sector: SectorKey | 'cash' | 'fx';
  label: string;
  value: number;
  percent: number;
  color: string;
}

// 銘柄別配分
export interface HoldingAllocation {
  symbol: string;
  name?: string;
  market: Market;
  value: number;
  percent: number;
  color: string;
}

// API レスポンス
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}
