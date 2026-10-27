'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartData, Holding, MarketSnapshot, SectorPeriod, SparklineItem, StockPrice, WatchlistItem } from '@/types';
import { readJson } from '@/components/detail/data';
import { heatTiles } from './model';
import { QUOTE_TARGETS, SECTOR_TARGETS } from './symbols';

type HeatData = { holdings: Holding[]; watchlist: WatchlistItem[]; prices: Record<string, StockPrice> };

export function useMarketWorkspace() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot>();
  const [lines, setLines] = useState<SparklineItem[]>([]);
  const [heat, setHeat] = useState<HeatData>();
  const [charts, setCharts] = useState<Record<string, ChartData>>({});
  const [period, setPeriod] = useState<SectorPeriod>('day');
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [errors, setErrors] = useState({ market: false, lines: false, heat: false, charts: false });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const lock = useRef(false);
  const chartRequest = useRef(0);

  const loadCharts = useCallback(async (signal?: AbortSignal) => {
    const request = ++chartRequest.current;
    setChartLoading(true);
    const results = await Promise.allSettled(SECTOR_TARGETS.map(async ({ key }) => {
      const data = await readJson<ChartData>(`/api/chart?symbol=${key}&market=US&range=1y&interval=d`, signal);
      return [key, data] as const;
    }));
    if (signal?.aborted || request !== chartRequest.current) return;
    setCharts(Object.fromEntries(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])));
    setErrors((previous) => ({ ...previous, charts: results.some((result) => result.status === 'rejected') }));
    setChartLoading(false);
  }, []);

  const load = useCallback(async (force = false, signal?: AbortSignal) => {
    if (lock.current) return;
    lock.current = true;
    setLoading(true);
    const run = async (key: 'market' | 'lines' | 'heat', action: () => Promise<void>) => {
      try {
        await action();
        if (!signal?.aborted) setErrors((previous) => ({ ...previous, [key]: false }));
        return true;
      } catch {
        if (!signal?.aborted) setErrors((previous) => ({ ...previous, [key]: true }));
        return false;
      }
    };
    try {
      const results = await Promise.all([
        run('market', async () => {
          const data = await readJson<MarketSnapshot>(`/api/market${force ? '?refresh=1' : ''}`, signal);
          if (!signal?.aborted) setSnapshot(data);
        }),
        run('lines', async () => {
          const data = await readJson<{ items: SparklineItem[] }>('/api/sparklines', signal, {
            items: QUOTE_TARGETS.map(({ key, group }) => ({ symbol: key, market: group === 'fx' ? 'FX' : 'INDEX' })), days: 5,
          });
          if (!signal?.aborted) setLines(data.items);
        }),
        run('heat', async () => {
          const [portfolio, watchlist, cached] = await Promise.all([
            readJson<{ holdings: Holding[]; stockPrices: Record<string, StockPrice> }>('/api/portfolio-data', signal),
            readJson<{ watchlistItems: WatchlistItem[] }>('/api/watchlist', signal),
            readJson<{ prices: Record<string, StockPrice> }>('/api/prices', signal),
          ]);
          let prices = { ...portfolio.stockPrices, ...cached.prices };
          if (force) {
            const symbols = [...new Map([...portfolio.holdings, ...watchlist.watchlistItems,
              { symbol: 'USDJPY', market: 'FX' as const }].filter((item) => item.symbol !== 'CASH')
              .map((item) => [`${item.symbol}|${item.market}`, { symbol: item.symbol, market: item.market }])).values()];
            // 既存価格は保持し、失敗した銘柄を未更新として画面に知らせる。
            const updated = await readJson<{ prices: Record<string, StockPrice> }>('/api/prices', signal, { symbols });
            prices = { ...prices, ...updated.prices };
            if (!signal?.aborted) setHeat({ holdings: portfolio.holdings, watchlist: watchlist.watchlistItems, prices });
            if (symbols.some((item) => !updated.prices[`${item.symbol}|${item.market}`])) throw new Error('partial_prices');
          } else if (!signal?.aborted) setHeat({ holdings: portfolio.holdings, watchlist: watchlist.watchlistItems, prices });
        }),
      ]);
      if (!signal?.aborted && results.every(Boolean)) setUpdatedAt(new Date().toISOString());
    } finally {
      lock.current = false;
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Strict Modeの再実行でも中断された初回取得とロックが競合しないよう遅延する。
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(false, controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  const needsCharts = period !== 'day';
  useEffect(() => {
    if (!needsCharts) return;
    const controller = new AbortController();
    void loadCharts(controller.signal);
    return () => controller.abort();
  }, [needsCharts, loadCharts]);

  const refresh = useCallback(async () => {
    await Promise.all([load(true), needsCharts ? loadCharts() : Promise.resolve()]);
  }, [load, loadCharts, needsCharts]);

  return {
    snapshot, lines, tiles: heat ? heatTiles(heat.holdings, heat.watchlist, heat.prices) : [],
    heatLoaded: !!heat, charts, period, setPeriod, loading, chartLoading, errors, updatedAt, refresh,
  };
}
