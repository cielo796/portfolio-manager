import { Market } from '@/types';

// 数値フォーマット（通貨）
export const formatCurrency = (
  value: number,
  currency: 'JPY' | 'USD' = 'JPY',
  options?: Intl.NumberFormatOptions
): string => {
  const defaultOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    ...options,
  };

  return new Intl.NumberFormat('ja-JP', defaultOptions).format(value);
};

// パーセント表示
export const formatPercent = (value: number, decimals: number = 2): string => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
};

// 数値フォーマット（カンマ区切り）
export const formatNumber = (value: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

// 日付フォーマット
export const formatDate = (dateString: string, format: 'full' | 'short' | 'relative' = 'short'): string => {
  const date = new Date(dateString);
  const now = new Date();
  
  if (format === 'relative') {
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
  }
  
  if (format === 'full') {
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

// 市場表示名
export const getMarketLabel = (market: Market): string => {
  if (market === 'US') return '米国株';
  if (market === 'JP') return '日本株';
  return 'FX';
};

// FXシンボルのクォート通貨を推定（例: USDJPY -> JPY, EURUSD -> USD）
export const getFxQuoteCurrency = (symbol?: string): 'USD' | 'JPY' => {
  const normalized = (symbol || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (normalized.length >= 6) {
    const quote = normalized.slice(3, 6);
    if (quote === 'USD') return 'USD';
  }
  return 'JPY';
};

// 市場の通貨（FXは通貨ペアのクォート通貨）
export const getMarketCurrency = (market: Market, symbol?: string): 'USD' | 'JPY' => {
  if (market === 'US') return 'USD';
  if (market === 'JP') return 'JPY';
  return getFxQuoteCurrency(symbol);
};

// 損益の色クラス
export const getProfitLossColor = (value: number): string => {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-slate-400';
};

// 損益の背景色クラス
export const getProfitLossBgColor = (value: number): string => {
  if (value > 0) return 'bg-emerald-500/10';
  if (value < 0) return 'bg-red-500/10';
  return 'bg-slate-500/10';
};

// セクター別の色
export const SECTOR_COLORS: Record<string, string> = {
  'Technology': '#3b82f6',
  'Healthcare': '#10b981',
  'Finance': '#f59e0b',
  'Consumer': '#ec4899',
  'Energy': '#ef4444',
  'Industrial': '#8b5cf6',
  'Materials': '#6366f1',
  'Utilities': '#14b8a6',
  'Real Estate': '#f97316',
  'Communication': '#06b6d4',
  'FX': '#22d3ee',
  'Cash': '#22c55e',
  'その他': '#64748b',
};

// ティッカーシンボルの正規化
export const normalizeSymbol = (symbol: string): string => {
  return symbol.toUpperCase().trim();
};

export const normalizeFxSymbol = (symbol: string): string => {
  return symbol.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
};

// ローカルストレージ操作
export const storage = {
  get: <T>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set: <T>(key: string, value: T): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      console.error('Failed to save to localStorage');
    }
  },
  remove: (key: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  },
};
