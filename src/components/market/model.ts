import type { Candle, Holding, MarketHeatTile, SectorPeriod, StockPrice, WatchlistItem } from '@/types';
import { normalizeSectorKey } from '@/lib/sectors';
import { priceKey } from '@/lib/price-key';
import { getMarketCurrency } from '@/lib/utils';

export function sectorReturn(candles: Candle[], period: Exclude<SectorPeriod, 'day'>, today: string): number | undefined {
  const endDate = new Date(`${today}T00:00:00Z`);
  if (period === 'week') endDate.setUTCDate(endDate.getUTCDate() - 7);
  else if (period === 'month') {
    const day = endDate.getUTCDate();
    endDate.setUTCDate(1);
    endDate.setUTCMonth(endDate.getUTCMonth() - 1);
    const lastDay = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0)).getUTCDate();
    endDate.setUTCDate(Math.min(day, lastDay));
  } else endDate.setUTCFullYear(endDate.getUTCFullYear(), 0, 0);
  const start = endDate.toISOString().slice(0, 10);
  const valid = candles.filter((candle) => candle.date <= today && Number.isFinite(candle.close) && candle.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = valid.at(-1);
  // 休場日は直前の営業日を基準にし、基準日以前のデータがなければ未取得とする。
  const baseline = valid.findLast((candle) => candle.date <= start);
  if (!latest || !baseline || latest.date <= start) return undefined;
  return (latest.close / baseline.close - 1) * 100;
}

export function heatTiles(holdings: Holding[], watchlist: WatchlistItem[], prices: Record<string, StockPrice>): MarketHeatTile[] {
  const tiles = new Map<string, MarketHeatTile>();
  const usdJpy = prices[priceKey('USDJPY', 'FX')]?.price;
  for (const item of holdings) {
    if (item.symbol === 'CASH') continue;
    const key = priceKey(item.symbol, item.market);
    const price = prices[key];
    const conversion = getMarketCurrency(item.market, item.symbol) === 'USD' ? usdJpy : 1;
    const value = price && conversion && Number.isFinite(conversion) && conversion > 0
      ? Math.abs(item.shares * price.price * conversion) : undefined;
    const previous = tiles.get(key);
    tiles.set(key, {
      ...item, key, held: true, sector: item.market === 'FX' ? 'fx' : normalizeSectorKey(item.sector),
      value: value !== undefined && Number.isFinite(value) ? (previous?.value ?? 0) + value : undefined,
      changePercent: price && Number.isFinite(price.change_percent) ? price.change_percent : undefined,
    });
  }
  for (const item of watchlist) {
    if (item.symbol === 'CASH') continue;
    const key = priceKey(item.symbol, item.market);
    if (tiles.has(key)) continue;
    const price = prices[key];
    tiles.set(key, {
      ...item, key, held: false, sector: item.market === 'FX' ? 'fx' : normalizeSectorKey(item.sector),
      changePercent: price && Number.isFinite(price.change_percent) ? price.change_percent : undefined,
    });
  }
  return [...tiles.values()];
}

export function heatBackground(percent?: number): string {
  if (percent === undefined || !Number.isFinite(percent) || percent === 0) return '#1d2530';
  const intensity = 15 + Math.min(1, Math.abs(percent) / 3) * 70;
  return `color-mix(in srgb, var(--pm-${percent > 0 ? 'up' : 'down'}) ${intensity}%, #1d2530)`;
}
