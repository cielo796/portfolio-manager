import type { FundamentalMetrics, SparklineItem, StockPrice, WatchlistItem } from '@/types';
import { formatCurrency, formatNumber, formatPercent, getMarketCurrency } from '@/lib/utils';
import { formatMetricCurrency } from './format';

export const WATCHLIST_COLUMNS = [
  { id: 'grip', label: '並べ替え', size: 40 },
  { id: 'symbol', label: 'コード', size: 64 },
  { id: 'name', label: '銘柄名', size: 150 },
  { id: 'price', label: '現在値', size: 90, numeric: true },
  { id: 'change', label: '前日比', size: 72, numeric: true },
  { id: 'changePercent', label: '前日比%', size: 76, numeric: true },
  { id: 'volume', label: '出来高', size: 76, numeric: true },
  { id: 'sparkline', label: '5日', size: 90 },
  { id: 'high', label: '52週高値', size: 90, numeric: true },
  { id: 'low', label: '52週安値', size: 90, numeric: true },
  { id: 'fromHigh', label: '高値から%', size: 82, numeric: true },
  { id: 'target', label: '目標価格', size: 90, numeric: true },
  { id: 'toTarget', label: '目標まで%', size: 82, numeric: true },
  { id: 'pe', label: 'PER', size: 64, numeric: true },
  { id: 'pbr', label: 'PBR', size: 64, numeric: true },
  { id: 'yield', label: '配当利回り', size: 82, numeric: true },
  { id: 'cap', label: '時価総額', size: 96, numeric: true },
  { id: 'earnings', label: '次回決算', size: 94 },
  { id: 'memo', label: 'メモ', size: 240 },
] as const;

export type WatchlistColumnId = typeof WATCHLIST_COLUMNS[number]['id'];
export type WatchlistRow = {
  item: WatchlistItem;
  price?: StockPrice;
  fundamental?: FundamentalMetrics;
  sparkline?: SparklineItem;
};

export function targetGap(row: WatchlistRow) {
  const target = row.item.target_price;
  return target != null && target > 0 && row.price && row.price.price > 0
    ? (target / row.price.price - 1) * 100 : undefined;
}

export function formatVolume(value: number | null | undefined, market: WatchlistItem['market']) {
  if (value == null || !Number.isFinite(value) || value < 0) return '—';
  const units: Array<[number, string]> = market === 'JP'
    ? [[1e8, '億'], [1e4, '万']] : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  const unit = units.find(([scale]) => value >= scale);
  return unit ? `${formatNumber(value / unit[0], 1)}${unit[1]}` : formatNumber(value, 0);
}

export function formatWatchlistCell(row: WatchlistRow, id: WatchlistColumnId): string {
  const { item, price, fundamental, sparkline } = row;
  const currency = getMarketCurrency(item.market, item.symbol);
  const money = (value?: number | null) => value == null || !Number.isFinite(value) ? '—' : formatCurrency(value, currency);
  const multiple = (value?: number) => value == null || !Number.isFinite(value) ? '—' : `${formatNumber(value, 2)}倍`;
  switch (id) {
    case 'grip': return '';
    case 'symbol': return item.symbol;
    case 'name': return item.name || price?.name || '—';
    case 'price': return money(price?.price);
    case 'change': return price ? `${price.change > 0 ? '+' : ''}${formatNumber(price.change, item.market === 'FX' ? 3 : currency === 'USD' ? 2 : 0)}` : '—';
    case 'changePercent': return price ? formatPercent(price.change_percent) : '—';
    case 'volume': return formatVolume(price?.volume, item.market);
    case 'sparkline': return '—';
    case 'high': return money(sparkline?.high52w);
    case 'low': return money(sparkline?.low52w);
    case 'fromHigh': return price && sparkline?.high52w && sparkline.high52w > 0 ? formatPercent((price.price / sparkline.high52w - 1) * 100) : '—';
    case 'target': return item.target_price != null && item.target_price > 0 ? money(item.target_price) : '未設定';
    case 'toTarget': { const gap = targetGap(row); return gap === undefined ? '—' : formatPercent(gap); }
    case 'pe': return multiple(fundamental?.trailing_pe);
    case 'pbr': return multiple(fundamental?.pbr);
    case 'yield': return fundamental?.dividend_yield == null ? '—' : `${formatNumber(fundamental.dividend_yield, 1)}%`;
    case 'cap': return fundamental?.market_cap == null ? '—' : formatMetricCurrency(fundamental.market_cap, fundamental.currency ?? currency);
    case 'earnings': return fundamental?.next_earnings_date ?? '—';
    case 'memo': return item.memo || '—';
  }
}
