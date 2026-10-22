'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Holding, NewsItem, WatchlistItem } from '@/types';
import { fetchNews, fetchNewsFilterData } from './api';
import { sortNewsNewestFirst } from './format';
import { NewsFilterPane } from './news-filter-pane';
import { NewsListPane } from './news-list-pane';
import { NewsPreviewPane } from './news-preview-pane';
import type { NewsFilterMode, NewsSymbolOption } from './types';

export function NewsWorkspace() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [mode, setMode] = useState<NewsFilterMode>('all');
  const [excludedSymbols, setExcludedSymbols] = useState<Set<string>>(() => new Set());
  const [excludedSources, setExcludedSources] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const items = await fetchNews();
        if (!active) return;
        setNews(items);
        setFetchedAt(new Date());
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    void (async () => {
      const data = await fetchNewsFilterData();
      if (!active) return;
      setHoldings(data.holdings);
      setWatchlistItems(data.watchlistItems);
    })();

    return () => {
      active = false;
    };
  }, []);

  const reload = async (refresh: boolean) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(false);

    try {
      const [items, data] = await Promise.all([fetchNews(refresh), fetchNewsFilterData()]);
      setNews(items);
      setFetchedAt(new Date());
      setHoldings(data.holdings);
      setWatchlistItems(data.watchlistItems);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const newsCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of news) {
      counts.set(item.symbol, (counts.get(item.symbol) ?? 0) + 1);
    }
    return counts;
  }, [news]);

  const symbolNames = useMemo(() => {
    const names = new Map<string, string>();
    const add = (symbol: string | undefined, name: string | undefined) => {
      const key = symbol?.trim();
      if (!key || key === 'CASH') return;
      const label = name?.trim();
      if (label || !names.has(key)) {
        names.set(key, label || key);
      }
    };

    for (const holding of holdings) add(holding.symbol, holding.name);
    for (const item of watchlistItems) add(item.symbol, item.name);
    for (const item of news) add(item.symbol, undefined);
    return names;
  }, [holdings, watchlistItems, news]);

  const symbols = useMemo<NewsSymbolOption[]>(() => {
    const candidates = mode === 'holdings'
      ? holdings.map((holding) => holding.symbol)
      : mode === 'watchlist'
        ? watchlistItems.map((item) => item.symbol)
        : Array.from(symbolNames.keys());
    const seen = new Set<string>();
    const options: NewsSymbolOption[] = [];

    for (const rawSymbol of candidates) {
      const symbol = rawSymbol.trim();
      if (!symbol || symbol === 'CASH' || seen.has(symbol)) continue;
      seen.add(symbol);
      options.push({
        symbol,
        name: symbolNames.get(symbol) ?? symbol,
        count: newsCounts.get(symbol) ?? 0,
      });
    }

    return options;
  }, [mode, holdings, watchlistItems, symbolNames, newsCounts]);

  const sources = useMemo(() => {
    const unique = new Set<string>();
    for (const item of news) {
      if (item.source) unique.add(item.source);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [news]);

  const activeSymbols = useMemo(
    () => new Set(symbols.filter((item) => !excludedSymbols.has(item.symbol)).map((item) => item.symbol)),
    [symbols, excludedSymbols]
  );

  const visibleNews = useMemo(
    () => sortNewsNewestFirst(news.filter((item) => activeSymbols.has(item.symbol) && !excludedSources.has(item.source))),
    [news, activeSymbols, excludedSources]
  );

  const selected = useMemo(
    () => visibleNews.find((item) => item.id === selectedId) ?? null,
    [visibleNews, selectedId]
  );

  const toggleSymbol = (symbol: string) => {
    setExcludedSymbols((previous) => {
      const next = new Set(previous);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const toggleSource = (source: string) => {
    setExcludedSources((previous) => {
      const next = new Set(previous);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-full min-w-0 flex-col min-[900px]:h-full">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-1 min-[900px]:grid-cols-[210px_minmax(0,1fr)_minmax(300px,380px)]">
        <NewsFilterPane
          mode={mode}
          onModeChange={setMode}
          symbols={symbols}
          excludedSymbols={excludedSymbols}
          onToggleSymbol={toggleSymbol}
          sources={sources}
          excludedSources={excludedSources}
          onToggleSource={toggleSource}
        />
        <NewsListPane
          news={visibleNews}
          selectedId={selected?.id ?? null}
          onSelect={(item) => setSelectedId(item.id)}
          fetchedAt={fetchedAt}
          loading={loading}
          refreshing={refreshing}
          error={error}
          onRefresh={() => void reload(true)}
          onRetry={() => void reload(false)}
        />
        <NewsPreviewPane item={selected} />
      </div>
    </div>
  );
}
