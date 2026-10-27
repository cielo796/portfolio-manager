import type { Holding, NewsItem, WatchlistItem } from '@/types';

type NewsResponse = {
  news?: NewsItem[];
};

type PortfolioDataResponse = {
  holdings?: Holding[];
};

type WatchlistResponse = {
  watchlistItems?: WatchlistItem[];
};

export type NewsFilterData = {
  holdings: Holding[];
  watchlistItems: WatchlistItem[];
};

const getJson = async <T,>(url: string): Promise<T | null> => {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const fetchNews = async (refresh = false): Promise<NewsItem[]> => {
  const response = await fetch(`/api/news${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('failed_to_load_news');
  }

  const data = (await response.json()) as NewsResponse;
  return Array.isArray(data.news) ? data.news : [];
};

export const fetchNewsFilterData = async (): Promise<NewsFilterData> => {
  const [portfolio, watchlist] = await Promise.all([
    getJson<PortfolioDataResponse>('/api/portfolio-data'),
    getJson<WatchlistResponse>('/api/watchlist'),
  ]);

  return {
    holdings: Array.isArray(portfolio?.holdings) ? portfolio.holdings : [],
    watchlistItems: Array.isArray(watchlist?.watchlistItems) ? watchlist.watchlistItems : [],
  };
};
