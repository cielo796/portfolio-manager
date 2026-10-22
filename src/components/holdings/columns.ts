import type { HoldingWithPrice, Portfolio, StockPrice } from '@/types';
import { computeSummary } from '@/lib/portfolio-calc';
import { priceKey } from '@/lib/price-key';
import { getSectorLabel } from '@/lib/sectors';
import { formatCurrency, formatNumber, formatPercent, getMarketCurrency, getMarketLabel } from '@/lib/utils';

export const HOLDING_COLUMNS = [
  { id: 'symbol', label: 'コード', size: 64 },
  { id: 'name', label: '銘柄名', size: 138 },
  { id: 'market', label: '市場', size: 44 },
  { id: 'sector', label: 'セクター', size: 82 },
  { id: 'shares', label: '数量', size: 64, numeric: true },
  { id: 'cost', label: '取得単価', size: 80, numeric: true },
  { id: 'price', label: '現在値', size: 80, numeric: true },
  { id: 'change', label: '前日比', size: 70, numeric: true, signed: true },
  { id: 'changePercent', label: '前日比%', size: 68, numeric: true, signed: true },
  { id: 'valueLocal', label: '評価額（現地）', size: 100, numeric: true },
  { id: 'valueJpy', label: '評価額（円）', size: 100, numeric: true },
  { id: 'profit', label: '評価損益', size: 96, numeric: true, signed: true },
  { id: 'profitPercent', label: '損益%', size: 68, numeric: true, signed: true },
  { id: 'daily', label: '当日損益', size: 92, numeric: true, signed: true },
  { id: 'weight', label: '構成比', size: 72, numeric: true },
  { id: 'account', label: '口座', size: 100 },
  { id: 'memo', label: 'メモ', size: 160 },
  { id: 'updated', label: '最終価格更新', size: 150 },
] as const;

export type HoldingColumnId = typeof HOLDING_COLUMNS[number]['id'];
export type HoldingRow = {
  holding: HoldingWithPrice;
  values: Record<HoldingColumnId, string | number | undefined>;
};

export const holdingSector = (holding: HoldingWithPrice) => holding.symbol === 'CASH'
  ? '現金' : holding.market === 'FX' ? 'FX' : getSectorLabel(holding.sector);
export const holdingMarket = (holding: HoldingWithPrice) => holding.symbol === 'CASH' ? '現金' : getMarketLabel(holding.market);

export function createHoldingRows(
  holdings: HoldingWithPrice[], portfolios: Portfolio[], prices: Record<string, StockPrice>, usdJpy: number, total: number
): HoldingRow[] {
  return holdings.map((holding) => {
    const price = prices[priceKey(holding.symbol, holding.market)];
    const missing = holding.price_status === 'missing';
    const cash = holding.price_status === 'cash';
    return {
      holding,
      values: {
        symbol: holding.symbol,
        name: holding.name ?? holding.symbol,
        market: holding.market,
        sector: holdingSector(holding),
        shares: holding.shares,
        cost: cash ? 1 : holding.avg_cost,
        price: missing ? undefined : holding.current_price,
        change: missing ? undefined : cash ? 0 : price?.change,
        changePercent: missing ? undefined : holding.change_percent,
        valueLocal: holding.current_value,
        valueJpy: holding.current_value_jpy,
        profit: missing ? undefined : holding.profit_loss,
        profitPercent: missing ? undefined : holding.profit_loss_percent,
        daily: missing ? undefined : computeSummary([holding], usdJpy).daily_change,
        weight: total > 0 ? (holding.current_value_jpy ?? 0) / total * 100 : 0,
        account: portfolios.find((portfolio) => portfolio.id === holding.portfolio_id)?.name ?? '未設定',
        memo: holding.memo ?? '',
        updated: cash ? undefined : price?.updated_at,
      },
    };
  });
}

const MISSING_COLUMNS = new Set<HoldingColumnId>(['price', 'change', 'changePercent', 'profit', 'profitPercent', 'daily', 'updated']);
const LOCAL_COLUMNS = new Set<HoldingColumnId>(['cost', 'price', 'valueLocal']);

export function formatHoldingCell(row: HoldingRow, id: HoldingColumnId): string {
  if (row.holding.price_status === 'missing' && MISSING_COLUMNS.has(id)) return '価格未取得';
  const value = row.values[id];
  if (value === undefined) return '—';
  if (id === 'updated') return new Date(String(value)).toLocaleString('ja-JP');
  if (typeof value === 'string') return value;
  const currency = getMarketCurrency(row.holding.market, row.holding.symbol);
  if (LOCAL_COLUMNS.has(id)) return formatCurrency(value, currency, row.holding.market === 'FX' && id !== 'valueLocal'
    ? { minimumFractionDigits: 3, maximumFractionDigits: 5 } : undefined);
  if (id === 'valueJpy' || id === 'profit' || id === 'daily') return `${value > 0 && id !== 'valueJpy' ? '+' : ''}${formatCurrency(value)}`;
  if (id === 'changePercent' || id === 'profitPercent') return formatPercent(value);
  if (id === 'weight') return `${formatNumber(value, 1)}%`;
  if (id === 'change') return `${value > 0 ? '+' : ''}${formatNumber(value, row.holding.market === 'FX' ? 3 : currency === 'USD' ? 2 : 0)}`;
  return formatNumber(value, Number.isInteger(value) ? 0 : 4);
}
