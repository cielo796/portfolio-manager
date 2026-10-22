import 'server-only';

import type { Candle, ChartData, ChartMarket, PriceHistoryRow } from '@/types';
import { fetchYahooChart, toYahooSymbol } from '@/lib/market';
import { getDb } from './connection';

const historyGlobal = globalThis as typeof globalThis & {
  __portfolioPriceHistoryCache?: {
    metadata: Map<string, { currency: string; timeZone: string }>;
    pending: Map<string, Promise<ChartData>>;
  };
};
const { metadata, pending } = historyGlobal.__portfolioPriceHistoryCache ??= { metadata: new Map(), pending: new Map() };
const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function exchangeDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dayStart(date: string, timeZone: string): number {
  const utc = Date.parse(`${date}T00:00:00Z`);
  let instant = utc;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find((item) => item.type === type)!.value);
    const local = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    instant += utc - local;
  }
  return Math.floor(instant / 1000);
}

export function historyFetchParams(
  latest: { date: string; updated_at: string } | undefined,
  now: Date,
  timeZone: string,
): Record<string, string> | null {
  if (!latest) return { range: '5y' };
  const today = exchangeDate(now, timeZone);
  const previous = new Date(`${today}T00:00:00Z`);
  do { previous.setUTCDate(previous.getUTCDate() - 1); }
  while (previous.getUTCDay() === 0 || previous.getUTCDay() === 6);
  if (latest.date >= previous.toISOString().slice(0, 10)) {
    if (now.getTime() - Date.parse(latest.updated_at) < 15 * 60 * 1000) return null;
    return { range: '5d' };
  }
  return { period1: String(dayStart(latest.date, timeZone)), period2: String(Math.floor(now.getTime() / 1000)) };
}

export function listPriceHistory(symbol: string, market: ChartMarket, start = '0000-01-01', end = '9999-12-31'): Candle[] {
  return getDb().prepare(`
    SELECT date, open, high, low, close, volume FROM price_history
    WHERE symbol = ? AND market = ? AND date >= ? AND date <= ? ORDER BY date
  `).all(symbol.trim().toUpperCase(), market, start, end) as Candle[];
}

export function upsertPriceHistory(symbol: string, market: ChartMarket, candles: readonly Candle[], fetchedAt: string): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO price_history (symbol, market, date, open, high, low, close, volume, updated_at)
    VALUES (@symbol, @market, @date, @open, @high, @low, @close, @volume, @updated_at)
    ON CONFLICT(symbol, market, date) DO UPDATE SET
      open = excluded.open, high = excluded.high, low = excluded.low,
      close = excluded.close, volume = excluded.volume, updated_at = excluded.updated_at
  `);
  db.transaction(() => {
    for (const candle of candles) {
      if (!Number.isFinite(candle.close)) continue;
      insert.run({ ...candle, symbol: symbol.trim().toUpperCase(), market, updated_at: fetchedAt });
    }
  })();
}

function defaultMetadata(symbol: string, market: ChartMarket) {
  return {
    currency: market === 'JP' || symbol === '^N225' ? 'JPY'
      : market === 'FX' ? symbol.replace(/=X$/, '').replace(/[^A-Z]/g, '').slice(-3) : 'USD',
    timeZone: market === 'JP' || symbol === '^N225' ? 'Asia/Tokyo'
      : market === 'FX' ? 'Europe/London' : 'America/New_York',
  };
}

export function priceHistoryToday(symbol: string, market: ChartMarket, now = new Date()): string {
  const normalized = symbol.trim().toUpperCase();
  return exchangeDate(now, (metadata.get(`${normalized}|${market}`) ?? defaultMetadata(normalized, market)).timeZone);
}

async function loadPriceHistory(symbol: string, market: ChartMarket): Promise<ChartData> {
  const key = `${symbol}|${market}`;
  const latest = getDb().prepare(`
    SELECT date, updated_at FROM price_history WHERE symbol = ? AND market = ? ORDER BY date DESC LIMIT 1
  `).get(symbol, market) as Pick<PriceHistoryRow, 'date' | 'updated_at'> | undefined;
  let meta = metadata.get(key) ?? defaultMetadata(symbol, market);
  const params = historyFetchParams(latest, new Date(), meta.timeZone);
  let fetchedAt = latest?.updated_at ?? '';
  let stale = false;
  if (params) {
    try {
      const data = await fetchYahooChart(toYahooSymbol(symbol, market), params);
      const result = data.chart!.result![0];
      const timeZone = result.meta?.exchangeTimezoneName;
      // タイムゾーン不明の応答を推測した日付で保存しない
      if (!timeZone) throw new Error('missing_exchange_timezone');
      const quote = result.indicators?.quote?.[0];
      const candles: Candle[] = [];
      for (const [index, timestamp] of (result.timestamp ?? []).entries()) {
        const close = finiteOrNull(quote?.close?.[index]);
        if (close === null || !Number.isFinite(timestamp)) continue;
        candles.push({
          date: exchangeDate(new Date(timestamp * 1000), timeZone),
          open: finiteOrNull(quote?.open?.[index]), high: finiteOrNull(quote?.high?.[index]),
          low: finiteOrNull(quote?.low?.[index]), close, volume: finiteOrNull(quote?.volume?.[index]),
        });
      }
      if (candles.length === 0) throw new Error('empty_price_history');
      const updatedAt = new Date().toISOString();
      upsertPriceHistory(symbol, market, candles, updatedAt);
      fetchedAt = updatedAt;
      meta = { currency: result.meta?.currency || meta.currency, timeZone };
      metadata.set(key, meta);
    } catch {
      stale = true;
    }
  }
  const candles = listPriceHistory(symbol, market);
  if (candles.length === 0) throw new Error('price_history_unavailable');
  return { symbol, market, currency: meta.currency, candles, fetchedAt, stale };
}

export async function readPriceHistory(symbol: string, market: ChartMarket): Promise<ChartData> {
  const normalized = symbol.trim().toUpperCase();
  const key = `${normalized}|${market}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = loadPriceHistory(normalized, market);
  pending.set(key, request);
  try { return await request; }
  finally { pending.delete(key); }
}

export function isChartMarket(value: unknown): value is ChartMarket {
  return value === 'US' || value === 'JP' || value === 'FX' || value === 'INDEX';
}

export function isChartSymbol(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9^][A-Z0-9.^=/_-]{0,63}$/i.test(value.trim()) && value.trim().toUpperCase() !== 'CASH';
}
