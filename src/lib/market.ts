import 'server-only';

import type { ChartMarket, MarketGroup, MarketItem, MarketSnapshot } from '@/types';
import { MARKET_TARGETS } from '@/components/market/symbols';

export const MARKET_SYMBOLS = MARKET_TARGETS;

export type YahooChart = {
  chart?: {
    error?: unknown;
    result?: Array<{
      meta?: {
        regularMarketPrice?: number; regularMarketTime?: number; chartPreviousClose?: number;
        currency?: string; exchangeTimezoneName?: string;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{
        open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>;
        close?: Array<number | null>; volume?: Array<number | null>;
      }> };
    }>;
  };
};

export function toYahooSymbol(symbol: string, market: ChartMarket): string {
  const normalized = symbol.toUpperCase().trim();
  if (market === 'JP') {
    if (normalized.endsWith('.T')) return normalized;
    return `${normalized.endsWith('.JP') ? normalized.slice(0, -3) : normalized}.T`;
  }
  if (market === 'FX' && !normalized.endsWith('=X')) {
    const pair = normalized.replace(/[^A-Z]/g, '');
    return pair.length === 6 ? `${pair}=X` : normalized;
  }
  return normalized;
}

const chartGlobal = globalThis as typeof globalThis & {
  __portfolioYahooChartLimiter?: { active: number; queue: Array<() => void> };
};
// ルートごとのバンドルや開発時の再読み込みでも通信上限を共有する
const chartLimiter = chartGlobal.__portfolioYahooChartLimiter ??= { active: 0, queue: [] };

export async function fetchYahooChart(symbol: string, params: Record<string, string>): Promise<YahooChart> {
  await new Promise<void>((resolve) => {
    const start = () => { chartLimiter.active++; resolve(); };
    if (chartLimiter.active < 4) start();
    else chartLimiter.queue.push(start);
  });
  try {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('interval', '1d');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('chart_fetch_failed');
    const data = await response.json() as YahooChart;
    if (!data?.chart?.result?.[0] || data.chart.error) throw new Error('invalid_chart');
    return data;
  } finally {
    chartLimiter.active--;
    chartLimiter.queue.shift()?.();
  }
}

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function parseMarketChart(data: YahooChart, key: string, name: string, now: string, group: MarketGroup = 'index'): MarketItem | null {
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
    key, name, group, value, change, changePercent: change / previous * 100,
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
      const values = await Promise.all(MARKET_SYMBOLS.map(async ({ key, name, group }) => {
        try {
          const item = parseMarketChart(await fetchYahooChart(key, { range: '5d' }), key, name, new Date().toISOString(), group);
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
