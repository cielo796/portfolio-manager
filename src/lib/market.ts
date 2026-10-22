import 'server-only';

import type { MarketItem, MarketSnapshot } from '@/types';

export const MARKET_SYMBOLS = [
  { key: '^N225', name: '日経225' },
  { key: '^DJI', name: 'NYダウ' },
  { key: '^GSPC', name: 'S&P500' },
  { key: '^IXIC', name: 'NASDAQ' },
  { key: '^SOX', name: 'SOX' },
  { key: '^VIX', name: 'VIX' },
  { key: '^TNX', name: '米10年債' },
  { key: 'USDJPY=X', name: 'USD/JPY' },
  { key: 'EURJPY=X', name: 'EUR/JPY' },
  { key: 'CL=F', name: 'WTI' },
  { key: 'GC=F', name: '金' },
] as const;

type YahooChart = {
  chart?: {
    error?: unknown;
    result?: Array<{
      meta?: { regularMarketPrice?: number; regularMarketTime?: number; chartPreviousClose?: number };
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function parseMarketChart(data: YahooChart, key: string, name: string, now: string): MarketItem | null {
  const result = data.chart?.result?.[0];
  if (!result || data.chart?.error) return null;
  const value = result.meta?.regularMarketPrice;
  if (!positive(value)) return null;
  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(positive);
  const previous = closes.length >= 2 ? closes[closes.length - 2] : result.meta?.chartPreviousClose;
  if (!positive(previous)) return null;
  const change = value - previous;
  const timestamp = result.meta?.regularMarketTime;
  const date = positive(timestamp) ? new Date(timestamp * 1000) : null;
  return {
    key, name, value, change, changePercent: change / previous * 100,
    updatedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : now,
  };
}

export function createMarketReader() {
  const lastValues = new Map<string, MarketItem>();
  let cached: Omit<MarketSnapshot, 'dbFile'> | undefined;
  let expiresAt = 0;
  let pending: Promise<Omit<MarketSnapshot, 'dbFile'>> | undefined;

  return async function readMarket(refresh = false): Promise<Omit<MarketSnapshot, 'dbFile'>> {
    if (!refresh && cached && Date.now() < expiresAt) return cached;
    if (pending) return pending;
    pending = (async () => {
      const failed: string[] = [];
      const values = await Promise.all(MARKET_SYMBOLS.map(async ({ key, name }) => {
        try {
          const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(key)}`);
          url.searchParams.set('range', '5d');
          url.searchParams.set('interval', '1d');
          const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error('market_fetch_failed');
          const item = parseMarketChart(await response.json() as YahooChart, key, name, new Date().toISOString());
          if (!item) throw new Error('invalid_market_chart');
          lastValues.set(key, item);
          return item;
        } catch {
          failed.push(key);
          return lastValues.get(key);
        }
      }));
      cached = {
        items: values.filter((item): item is MarketItem => item !== undefined),
        fetchedAt: new Date().toISOString(),
        failed: MARKET_SYMBOLS.filter(({ key }) => failed.includes(key)).map(({ key }) => key),
      };
      expiresAt = Date.now() + 60000;
      return cached;
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
}

export const readMarket = createMarketReader();
