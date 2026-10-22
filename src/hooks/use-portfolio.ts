'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Portfolio, 
  Holding, 
  StockPrice, 
  NewsItem, 
  ExchangeRate,
  Transaction
} from '@/types';
import { 
  mockPortfolios, 
  mockHoldings, 
  mockStockPrices, 
  mockNews, 
  mockExchangeRate 
} from '@/lib/mock-data';
import { priceKey } from '@/lib/price-key';
import {
  computeHoldingsWithPrices,
  computeSummary,
  computeSectorAllocation,
  computeHoldingAllocation,
} from '@/lib/portfolio-calc';

export const usePortfolio = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [stockPrices, setStockPrices] = useState<Record<string, StockPrice>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate>(mockExchangeRate);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingNews, setIsRefreshingNews] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [priceError, setPriceError] = useState(false);

  const refreshNews = useCallback(async () => {
    setIsRefreshingNews(true);
    try {
      const response = await fetch('/api/news?refresh=1', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('failed_to_load_news');
      }

      const data = (await response.json()) as { news?: NewsItem[] };
      setNews(Array.isArray(data.news) ? data.news : mockNews);
    } catch {
      setNews((prev) => (prev.length > 0 ? prev : mockNews));
    } finally {
      setIsRefreshingNews(false);
    }
  }, []);

  const loadPortfolioData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/portfolio-data', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('failed_to_load');
      }

      const data = await response.json() as {
        portfolios: Portfolio[];
        holdings: Holding[];
        transactions: Transaction[];
        stockPrices?: Record<string, StockPrice>;
        news?: NewsItem[];
      };
      const nextStockPrices = data.stockPrices ?? {};
      const usdJpyPrice = nextStockPrices[priceKey('USDJPY', 'FX')];
      const usdJpyRate = usdJpyPrice?.price;

      setPortfolios(data.portfolios ?? []);
      setHoldings(data.holdings ?? []);
      setTransactions(data.transactions ?? []);
      setStockPrices(nextStockPrices);
      setNews(Array.isArray(data.news) && data.news.length > 0 ? data.news : mockNews);
      if (usdJpyRate && Number.isFinite(usdJpyRate) && usdJpyRate > 0) {
        setExchangeRate((prev) => ({
          ...prev,
          rate: usdJpyRate,
          updated_at: usdJpyPrice?.updated_at ?? prev.updated_at,
        }));
      } else {
        setExchangeRate(mockExchangeRate);
      }
    } catch {
      setLoadError(true);
      // API未起動時などのフォールバック
      setPortfolios(mockPortfolios);
      setHoldings(mockHoldings);
      setTransactions([]);
      setStockPrices(mockStockPrices);
      setNews(mockNews);
      setExchangeRate(mockExchangeRate);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初期データ読み込み
  useEffect(() => {
    void loadPortfolioData();
  }, [loadPortfolioData]);

  // 株価更新
  const refreshPrices = useCallback(async () => {
    setIsRefreshing(true);
    setPriceError(false);
    try {
      const symbols = holdings
        .filter((holding) => holding.symbol !== 'CASH')
        .map((holding) => ({
          symbol: holding.symbol,
          market: holding.market,
          name: holding.name,
        }));

      // USD/JPY is always fetched so JPY conversion for US holdings can be updated.
      if (!symbols.some((item) => item.symbol === 'USDJPY' && item.market === 'FX')) {
        symbols.push({
          symbol: 'USDJPY',
          market: 'FX',
          name: 'USD/JPY',
        });
      }

      if (symbols.length === 0) return;

      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbols }),
      });
      if (!response.ok) { setPriceError(true); return; }

      const data = (await response.json()) as {
        prices?: Record<string, StockPrice>;
        updatedAt?: string;
      };
      const nextPrices = data.prices ?? {};

      if (Object.keys(nextPrices).length > 0) {
        setStockPrices((prev) => ({
          ...prev,
          ...nextPrices,
        }));
      }

      const usdJpyPrice = nextPrices[priceKey('USDJPY', 'FX')];
      const usdJpyRate = usdJpyPrice?.price;
      if (usdJpyRate && Number.isFinite(usdJpyRate) && usdJpyRate > 0) {
        setExchangeRate((prev) => ({
          ...prev,
          rate: usdJpyRate,
          updated_at: usdJpyPrice?.updated_at ?? data.updatedAt ?? new Date().toISOString(),
        }));
      }
    } catch (error) {
      setPriceError(true);
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [holdings]);

  const holdingsWithPrices = useMemo(
    () => computeHoldingsWithPrices(holdings, stockPrices, exchangeRate.rate),
    [holdings, stockPrices, exchangeRate.rate]
  );
  const summary = useMemo(
    () => computeSummary(holdingsWithPrices, exchangeRate.rate),
    [holdingsWithPrices, exchangeRate.rate]
  );
  const sectorAllocation = useMemo(
    () => computeSectorAllocation(holdingsWithPrices, summary.total_value_jpy),
    [holdingsWithPrices, summary.total_value_jpy]
  );
  const holdingAllocation = useMemo(
    () => computeHoldingAllocation(holdingsWithPrices, summary.total_value_jpy),
    [holdingsWithPrices, summary.total_value_jpy]
  );

  // 銘柄追加
  const addHolding = useCallback(async (holding: Omit<Holding, 'id' | 'created_at' | 'updated_at' | 'sort_order'>) => {
    const response = await fetch('/api/holdings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(holding),
    });

    if (!response.ok) {
      throw new Error('failed_to_add_holding');
    }

    const data = await response.json() as { holding: Holding };
    setHoldings((prev) => [...prev, data.holding]);
  }, []);

  const addTransaction = useCallback(async (transaction: Omit<Transaction, 'id' | 'total_amount' | 'created_at'>) => {
    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transaction),
    });

    if (!response.ok) {
      throw new Error('failed_to_add_transaction');
    }

    const data = await response.json() as { transaction: Transaction };
    setTransactions((prev) => [data.transaction, ...prev]);
  }, []);

  // 銘柄削除（決済）
  const removeHolding = useCallback(async (id: string) => {
    const response = await fetch(`/api/holdings/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('failed_to_remove_holding');
    }

    setHoldings((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // 銘柄更新
  const updateHolding = useCallback(async (id: string, updates: Partial<Holding>) => {
    const response = await fetch(`/api/holdings/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error('failed_to_update_holding');
    }

    const data = await response.json() as { holding: Holding };
    setHoldings((prev) => prev.map((h) => (h.id === id ? data.holding : h)));
  }, []);

  const reorderHoldings = useCallback(async (orderedHoldingIds: string[]) => {
    const orderedIdSet = new Set(orderedHoldingIds);
    const holdingsById = new Map(holdings.map((holding) => [holding.id, holding]));
    const orderedHoldings = orderedHoldingIds
      .map((id) => holdingsById.get(id))
      .filter((holding): holding is Holding => Boolean(holding));

    if (orderedHoldings.length === 0) return;

    const remainingHoldings = holdings.filter((holding) => !orderedIdSet.has(holding.id));
    const nextHoldings = [...orderedHoldings, ...remainingHoldings].map((holding, index) => ({
      ...holding,
      sort_order: index,
    }));

    setHoldings(nextHoldings);

    try {
      const response = await fetch('/api/holdings/reorder', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: nextHoldings.map((holding) => ({
            id: holding.id,
            sort_order: holding.sort_order,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('failed_to_reorder_holdings');
      }

      const data = await response.json() as { holdings?: Holding[] };
      setHoldings(data.holdings ?? nextHoldings);
    } catch {
      setHoldings(holdings);
      throw new Error('failed_to_reorder_holdings');
    }
  }, [holdings]);

  return {
    portfolios,
    holdings: holdingsWithPrices,
    transactions,
    stockPrices,
    news,
    exchangeRate,
    summary,
    sectorAllocation,
    holdingAllocation,
    isLoading,
    isRefreshing,
    isRefreshingNews,
    loadError,
    priceError,
    reloadPortfolioData: loadPortfolioData,
    refreshPrices,
    refreshNews,
    addHolding,
    addTransaction,
    removeHolding,
    updateHolding,
    reorderHoldings,
  };
};

