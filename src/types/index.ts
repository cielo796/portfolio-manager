import type { SectorKey } from '@/lib/sectors';

// 市場タイプ
export type Market = 'US' | 'JP' | 'FX';
export interface TopPick {
  id: string;
  symbol: string;
  market: Market;
  rank: number;
  theme: string | null;
  conviction: 'high' | 'medium' | 'low' | null;
  horizon: 'short' | 'medium' | 'long' | null;
  picked_at: string;
  picked_price: number;
  benchmark_at_pick: number | null;
  target_price: number | null;
  review_on: string | null;
  thesis: string | null;
  catalysts: string | null;
  risks: string | null;
  exit_rule: string | null;
  removed_at: string | null;
  removed_price: number | null;
  benchmark_at_remove: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  updated_by: string | null;
}
export interface TopPickView extends TopPick {
  name: string;
  state: '保有中' | '登録' | '未登録';
  current_price: number | null;
  current_benchmark: number | null;
  next_earnings_date: string | null;
}
export interface TopPickInput {
  symbol: string;
  market: Market;
  theme?: string | null;
  conviction?: TopPick['conviction'];
  horizon?: TopPick['horizon'];
  pickedAt?: string;
  pickedPrice?: number;
  targetPrice?: number | null;
  reviewOn?: string | null;
  thesis?: string | null;
  catalysts?: string | null;
  risks?: string | null;
  exitRule?: string | null;
}
export type MemoTag = 'earnings' | 'idea' | 'trade' | 'news' | 'review';
export interface MemoSymbol {
  symbol: string;
  market: Market;
}
export type MemoPriceSnapshot = Record<string, { price: number; currency: string; at: string }>;
export interface StockMemo {
  id: string;
  title: string;
  body: string;
  tag: MemoTag | null;
  price_snapshot: MemoPriceSnapshot;
  transaction_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  updated_by?: string | null;
  updated_pc?: string;
  symbols: MemoSymbol[];
}
export interface MemoInput {
  title: string;
  body: string;
  tag?: MemoTag | null;
  symbols: MemoSymbol[];
  transactionId?: string | null;
}
export interface MemoSymbolRow extends MemoSymbol {
  id: string;
  memo_id: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  updated_by?: string | null;
}
export type ChartMarket = Market | 'INDEX';
export type ChartRange = '3m' | '6m' | '1y' | '5y';
export type ChartInterval = 'd' | 'w' | 'm';

export interface DetailSymbol {
  symbol: string;
  market: Market;
  name?: string;
  sector?: string;
}

export interface ChartSettings {
  range: ChartRange;
  interval: ChartInterval;
  ma5: boolean;
  ma25: boolean;
  ma75: boolean;
  cost: boolean;
  target: boolean;
  trades: boolean;
}

export interface Candle {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface PriceHistoryRow extends Candle {
  symbol: string;
  market: ChartMarket;
  updated_at: string;
}

export interface ChartData {
  symbol: string;
  market: ChartMarket;
  currency: string;
  candles: Candle[];
  fetchedAt: string;
  stale: boolean;
}

export interface SparklineItem {
  symbol: string;
  market: ChartMarket;
  closes: number[];
  high52w?: number;
  low52w?: number;
}

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
  deleted_at?: string | null;
  updated_by?: string | null;
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
  ledger_opening_shares?: number | null;
  ledger_opening_cost?: number | null;
  sort_order: number;
  sector?: string;
  memo?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  updated_by?: string | null;
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
  realized_pl?: number | null;
  fx_rate?: number | null;
  holding_id?: string | null;
  transaction_date: string;
  memo?: string;
  created_at: string;
  deleted_at?: string | null;
  updated_by?: string | null;
  updated_at?: string;
}

// 株価情報
export interface StockPrice {
  symbol: string;
  market: Market;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume?: number | null;
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
  deleted_at?: string | null;
  updated_by?: string | null;
}

// 事前登録ティッカー
export interface TickerPreset {
  id: string;
  symbol: string;
  market: Market;
  name?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  updated_by?: string | null;
}

// トレードアイデア
export interface TradeIdea {
  id: string;
  symbol: string;
  market: Market;
  note: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  updated_by?: string | null;
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

export interface DisplaySettings {
  updown: 'jp' | 'us';
  density: 'compact' | 'standard';
}

export type MarketGroup = 'index' | 'fx' | 'rate' | 'commodity' | 'sector';
export type SectorPeriod = 'day' | 'week' | 'month' | 'ytd';

export interface MarketTarget {
  key: string;
  name: string;
  group: MarketGroup;
}

export interface MarketHeatTile extends DetailSymbol {
  key: string;
  sector: string;
  held: boolean;
  value?: number;
  changePercent?: number;
}

export interface MarketItem {
  key: string;
  name: string;
  group: MarketGroup;
  value: number;
  change: number;
  changePercent: number;
  updatedAt: string;
}

export interface MarketSnapshot {
  items: MarketItem[];
  fetchedAt: string;
  failed: string[];
  dbFile: string;
}

export type ShellSyncPeer = Pick<SyncPeer, 'id' | 'device_id' | 'name' | 'last_synced_at'>;

export interface ShellSyncLog {
  peer_device_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  received: number;
  sent: number;
  conflicts: number;
}

// LAN同期ではDBの全列をそのまま交換する
export type SyncTable = 'portfolios' | 'holdings' | 'transactions' | 'trade_ideas' | 'ticker_presets' | 'watchlist_items' | 'stock_memos' | 'memo_symbols' | 'top_picks' | 'portfolio_snapshots';
export type SyncValue = string | number | null;
export interface SyncRow {
  [column: string]: SyncValue;
  id: string;
  updated_at: string;
  updated_by: string | null;
}
export type SyncChanges = Record<SyncTable, SyncRow[]>;
export interface SyncConflict {
  table: SyncTable;
  id: string;
  winner: 'local' | 'remote';
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}
export interface SyncApplyResult {
  applied: number;
  skipped: number;
  conflicts: number;
  conflictDetails: SyncConflict[];
  canonicalChanges: SyncChanges;
  byTable?: Partial<Record<SyncTable, number>>;
}
export interface SyncPeer {
  id: string;
  device_id: string;
  name: string;
  base_url: string;
  secret: string;
  last_synced_at: string | null;
  last_pulled_until: string | null;
  last_pushed_until: string | null;
  created_at: string;
  updated_at: string;
}
export interface SyncPing {
  deviceId: string;
  deviceName: string;
  serverTime: string;
  schemaVersion: number;
}
export interface SyncTransport {
  ping(): Promise<SyncPing>;
  changes(since: string | null): Promise<{ changes: SyncChanges; serverTime: string }>;
  apply(changes: SyncChanges, lastSyncedAt: string | null): Promise<SyncApplyResult>;
}
export interface SyncResult {
  received: number;
  sent: number;
  conflicts: number;
  conflictDetails: SyncConflict[];
  clockSkewMs: number;
  warnings: string[];
  durationMs: number;
}

export interface PortfolioSnapshot {
  id: string;
  snapshot_date: string;
  portfolio_id: string | null;
  market_value_jpy: number;
  cost_basis_jpy: number;
  cash_jpy: number | null;
  usd_jpy: number | null;
  is_estimate: 0 | 1;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  updated_by: string | null;
}
export type SnapshotInput = Omit<PortfolioSnapshot, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'updated_by'>;
export interface HistoryPoint { date: string; value: number }
export interface HistoryBenchmarks {
  sp500: HistoryPoint[];
  nikkei: HistoryPoint[];
  usdJpy: HistoryPoint[];
  warnings: string[];
}

export interface SyncAutoConfig {
  mode: 'off' | 'startup' | 'interval';
  intervalMinutes: 15 | 30 | 60;
}

export interface SyncAutoStatus {
  config: SyncAutoConfig;
  running: boolean;
  lastSyncedAt: string | null;
  nextRunAt: string | null;
  latest: SyncHistoryEntry | null;
}

export interface SyncDiscoveredPeer {
  deviceId: string;
  deviceName: string;
  schemaVersion: number;
  address: string;
  port: number;
  expiresAt: number;
}

export interface SyncHistoryEntry {
  id: string;
  peer_device_id: string;
  peerName: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed' | 'partial';
  received: number;
  sent: number;
  conflicts: number;
  detail: string | null;
  source: 'manual' | 'auto';
  durationMs: number | null;
  error: string | null;
  warnings: string[];
  byTable: Partial<Record<SyncTable, { received: number; sent: number }>>;
}
