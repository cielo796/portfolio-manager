// 市場タイプ
export type Market = 'US' | 'JP' | 'FX';

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
  market: Market;
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
}

// セクター配分
export interface SectorAllocation {
  sector: string;
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
