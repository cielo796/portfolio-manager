import { Market } from '@/types';

export const getMarketLabel = (market: Market) => {
  if (market === 'US') return '米国株';
  if (market === 'JP') return '日本株';
  return 'FX';
};

const toDisplayCurrency = (currency?: string): 'JPY' | 'USD' =>
  currency === 'USD' ? 'USD' : 'JPY';

export const formatMetricCurrency = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: toDisplayCurrency(currency),
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatMetricPercent = (value: number | undefined, withSign = false) => {
  if (value === undefined || !Number.isFinite(value)) return '-';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

export const formatMetricMultiple = (value: number | undefined) => {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(2)}倍`;
};
