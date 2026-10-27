'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DetailSymbol, Holding, StockPrice, TickerPreset, WatchlistItem } from '@/types';
import { priceKey } from '@/lib/price-key';

export const detailHref = (item: DetailSymbol) => `/detail?symbol=${encodeURIComponent(item.symbol)}&market=${item.market}`;

export async function readJson<T>(url: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function useDetailResource<T>(url: string, body?: string) {
  const [result, setResult] = useState<{ key: string; revision: number; data?: T; error?: string }>();
  const [revision, setRevision] = useState(0);
  const key = `${url}:${body ?? ''}`;
  const reload = useCallback(async () => { setRevision((value) => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void readJson<T>(url, controller.signal, body ? JSON.parse(body) : undefined)
      .then((data) => { if (!controller.signal.aborted) setResult({ key, revision, data }); })
      .catch(() => { if (!controller.signal.aborted) setResult((previous) => ({ key, revision, data: previous?.key === key ? previous.data : undefined, error: 'データを取得できませんでした。' })); });
    return () => controller.abort();
  }, [url, body, key, revision]);
  const current = result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, loading: current?.revision !== revision, reload };
}

export function useDetailCatalog() {
  const portfolio = useDetailResource<{ holdings: Holding[]; stockPrices: Record<string, StockPrice> }>('/api/portfolio-data');
  const watchlist = useDetailResource<{ watchlistItems: WatchlistItem[] }>('/api/watchlist');
  const reload = async () => { await Promise.all([portfolio.reload(), watchlist.reload()]); };
  return {
    holdings: portfolio.data?.holdings ?? [],
    watchlist: watchlist.data?.watchlistItems ?? [],
    prices: portfolio.data?.stockPrices ?? {},
    loading: portfolio.loading || watchlist.loading,
    error: portfolio.error || watchlist.error,
    reload,
  };
}

export function searchSymbols(items: DetailSymbol[], query: string): DetailSymbol[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  const unique = new Map<string, DetailSymbol>();
  for (const item of items) {
    if (item.symbol === 'CASH' || ![item.symbol, item.name ?? ''].some((value) => value.toLocaleLowerCase().includes(term))) continue;
    const key = priceKey(item.symbol, item.market);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, 10);
}

export function fallbackSymbol(query: string): DetailSymbol | undefined {
  const symbol = query.trim().toUpperCase();
  if (/^\d{4}$/.test(symbol)) return { symbol, market: 'JP' };
  if (/^[A-Z]{1,6}(?:[.-][A-Z])?$/.test(symbol)) return { symbol, market: 'US' };
}

export type SearchTickers = { tickerPresets: TickerPreset[] };
