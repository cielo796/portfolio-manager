'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Portfolio, 
  Holding, 
  HoldingWithPrice, 
  StockPrice, 
  NewsItem, 
  ExchangeRate,
  Transaction,
  PortfolioSummary,
  SectorAllocation
} from '@/types';
import { 
  mockPortfolios, 
  mockHoldings, 
  mockStockPrices, 
  mockNews, 
  mockExchangeRate 
} from '@/lib/mock-data';
import { getMarketCurrency, SECTOR_COLORS } from '@/lib/utils';

const isCashHolding = (holding: Holding | HoldingWithPrice) => holding.symbol === 'CASH';
const isFxHolding = (holding: Holding | HoldingWithPrice) => holding.market === 'FX';

export const usePortfolio = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [stockPrices, setStockPrices] = useState<Record<string, StockPrice>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate>(mockExchangeRate);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPortfolioData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/portfolio-data', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('failed_to_load');
      }

      const data = await response.json() as { portfolios: Portfolio[]; holdings: Holding[]; transactions: Transaction[] };
      setPortfolios(data.portfolios ?? []);
      setHoldings(data.holdings ?? []);
      setTransactions(data.transactions ?? []);
    } catch {
      // API未起動時などのフォールバック
      setPortfolios(mockPortfolios);
      setHoldings(mockHoldings);
      setTransactions([]);
    } finally {
      setStockPrices(mockStockPrices);
      setNews(mockNews);
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
      if (!response.ok) return;

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

      const usdJpyRate = nextPrices.USDJPY?.price;
      if (usdJpyRate && Number.isFinite(usdJpyRate) && usdJpyRate > 0) {
        setExchangeRate((prev) => ({
          ...prev,
          rate: usdJpyRate,
          updated_at: nextPrices.USDJPY?.updated_at ?? data.updatedAt ?? new Date().toISOString(),
        }));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [holdings]);

  // 保有銘柄に現在価格を追加
  const holdingsWithPrices: HoldingWithPrice[] = holdings.map(holding => {
    const isCash = isCashHolding(holding);
    const isFx = isFxHolding(holding);
    const priceData = stockPrices[holding.symbol];
    const currentPrice = isCash ? 1 : (priceData?.price ?? holding.avg_cost);
    const currentValue = isCash ? holding.shares : currentPrice * holding.shares;
    const costBasis = isCash ? holding.shares : holding.avg_cost * holding.shares;
    
    // 円換算
    const isUS = holding.market === 'US';
    const quoteCurrency = getMarketCurrency(holding.market, holding.symbol);
    const isUsdQuotedFx = isFx && quoteCurrency === 'USD';
    const rate = exchangeRate.rate;
    const currentValueJpy = (isUS || isUsdQuotedFx) ? currentValue * rate : currentValue;
    const costBasisJpy = (isUS || isUsdQuotedFx) ? costBasis * rate : costBasis;
    const profitLoss = currentValueJpy - costBasisJpy;
    const profitLossPercent = costBasisJpy > 0 ? (profitLoss / costBasisJpy) * 100 : 0;

    return {
      ...holding,
      name: isCash
        ? (holding.name || (holding.market === 'US' ? '米ドル現金' : '日本円現金'))
        : isFx
        ? (priceData?.name ?? holding.name ?? `${holding.symbol.slice(0, 3)}/${holding.symbol.slice(3, 6)}`)
        : (priceData?.name ?? holding.name),
      current_price: currentPrice,
      current_value: currentValue,
      current_value_jpy: currentValueJpy,
      profit_loss: profitLoss,
      profit_loss_percent: profitLossPercent,
      change_percent: isCash ? 0 : (priceData?.change_percent ?? 0),
    };
  });

  // ポートフォリオサマリー計算
  const summary: PortfolioSummary = holdingsWithPrices.reduce(
    (acc, holding) => {
      const isCash = isCashHolding(holding);
      const isFx = isFxHolding(holding);
      const valueJpy = holding.current_value_jpy ?? 0;
      const quoteCurrency = getMarketCurrency(holding.market, holding.symbol);
      const isUsdQuotedFx = isFx && quoteCurrency === 'USD';
      const costJpy = holding.market === 'US'
        ? (isCash ? holding.shares : holding.avg_cost * holding.shares) * exchangeRate.rate
        : isUsdQuotedFx
        ? (isCash ? holding.shares : holding.avg_cost * holding.shares) * exchangeRate.rate
        : (isCash ? holding.shares : holding.avg_cost * holding.shares);
      
      acc.total_value_jpy += valueJpy;
      acc.total_cost_jpy += costJpy;

      if (isCash) {
        acc.cash_value_jpy += valueJpy;
        if (holding.market === 'US') {
          acc.cash_value_usd += holding.current_value ?? 0;
        }
      } else if (isFx) {
        acc.fx_value_jpy += valueJpy;
        if (quoteCurrency === 'USD') {
          acc.fx_value_usd += holding.current_value ?? 0;
        }
      } else if (holding.market === 'US') {
        acc.us_stock_value_usd += holding.current_value ?? 0;
        acc.us_stock_value_jpy += valueJpy;
      } else {
        acc.jp_stock_value_jpy += valueJpy;
      }
      
      // 日次変動
      if (!isCash) {
        const dailyChange = (holding.change_percent ?? 0) / 100 * valueJpy;
        acc.daily_change += dailyChange;
      }
      
      return acc;
    },
    {
      total_value_jpy: 0,
      total_cost_jpy: 0,
      total_profit_loss: 0,
      total_profit_loss_percent: 0,
      us_stock_value_usd: 0,
      us_stock_value_jpy: 0,
      jp_stock_value_jpy: 0,
      fx_value_usd: 0,
      fx_value_jpy: 0,
      cash_value_usd: 0,
      cash_value_jpy: 0,
      daily_change: 0,
      daily_change_percent: 0,
    }
  );

  summary.total_profit_loss = summary.total_value_jpy - summary.total_cost_jpy;
  summary.total_profit_loss_percent = summary.total_cost_jpy > 0 
    ? (summary.total_profit_loss / summary.total_cost_jpy) * 100 
    : 0;
  summary.daily_change_percent = summary.total_value_jpy > 0
    ? (summary.daily_change / (summary.total_value_jpy - summary.daily_change)) * 100
    : 0;

  // セクター配分計算
  const sectorAllocation: SectorAllocation[] = Object.entries(
    holdingsWithPrices.reduce((acc, holding) => {
      const sector = isCashHolding(holding)
        ? (holding.sector || 'Cash')
        : isFxHolding(holding)
        ? (holding.sector || 'FX')
        : (holding.sector || 'その他');
      acc[sector] = (acc[sector] || 0) + (holding.current_value_jpy ?? 0);
      return acc;
    }, {} as Record<string, number>)
  ).map(([sector, value]) => ({
    sector,
    value,
    percent: summary.total_value_jpy > 0 ? (value / summary.total_value_jpy) * 100 : 0,
    color: SECTOR_COLORS[sector] || SECTOR_COLORS['その他'],
  }));

  // 銘柄追加
  const addHolding = useCallback(async (holding: Omit<Holding, 'id' | 'created_at' | 'updated_at'>) => {
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

  return {
    portfolios,
    holdings: holdingsWithPrices,
    transactions,
    stockPrices,
    news,
    exchangeRate,
    summary,
    sectorAllocation,
    isLoading,
    isRefreshing,
    refreshPrices,
    addHolding,
    addTransaction,
    removeHolding,
    updateHolding,
  };
};

