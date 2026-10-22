import { describe, expect, it } from 'vitest';
import type { Holding, StockPrice } from '@/types';
import {
  computeHoldingsWithPrices,
  computeSummary,
  computeSectorAllocation,
  computeHoldingAllocation,
} from '@/lib/portfolio-calc';
import { priceKey } from '@/lib/price-key';

const timestamp = '2026-01-01T00:00:00Z';
const usdJpy = 150;
const holding = (overrides: Partial<Holding> = {}): Holding => ({
  id: 'holding',
  portfolio_id: 'portfolio',
  symbol: 'AAPL',
  market: 'US',
  shares: 10,
  avg_cost: 100,
  sort_order: 0,
  sector: 'technology',
  created_at: timestamp,
  updated_at: timestamp,
  ...overrides,
});
const quote = (overrides: Partial<StockPrice> = {}): StockPrice => ({
  symbol: 'AAPL',
  market: 'US',
  name: 'Apple',
  price: 120,
  change: 2,
  change_percent: 2,
  currency: 'USD',
  updated_at: timestamp,
  ...overrides,
});
const priceMap = (...quotes: StockPrice[]) => Object.fromEntries(
  quotes.map((price) => [priceKey(price.symbol, price.market), price])
);

describe('computeHoldingsWithPrices / computeSummary', () => {
  it('米国株の評価額と損益を円換算する', () => {
    const result = computeHoldingsWithPrices([holding()], priceMap(quote()), usdJpy);
    expect(result[0]).toMatchObject({
      price_status: 'live', name: 'Apple', current_price: 120,
      current_value: 1200, current_value_jpy: 180000,
      profit_loss: 30000, profit_loss_percent: 20, change_percent: 2,
    });
    expect(computeSummary(result, usdJpy)).toMatchObject({
      total_value_jpy: 180000, total_cost_jpy: 150000,
      total_profit_loss: 30000, total_profit_loss_percent: 20,
      us_stock_value_usd: 1200, us_stock_value_jpy: 180000,
      missing_price_count: 0,
    });
  });

  it('USDクォートのFXを円換算する', () => {
    const result = computeHoldingsWithPrices([
      holding({ symbol: 'EURUSD', market: 'FX', shares: 1000, avg_cost: 1.1 }),
    ], priceMap(quote({ symbol: 'EURUSD', market: 'FX', price: 1.2 })), usdJpy);
    expect(result[0].current_value).toBe(1200);
    expect(result[0].current_value_jpy).toBe(180000);
    expect(result[0].profit_loss).toBeCloseTo(15000);
    expect(result[0].profit_loss_percent).toBeCloseTo(100 / 11);
    expect(computeSummary(result, usdJpy)).toMatchObject({
      fx_value_usd: 1200, fx_value_jpy: 180000, total_cost_jpy: 165000,
    });
  });

  it('JPYクォートのFXは円換算を重ねない', () => {
    const result = computeHoldingsWithPrices([
      holding({ symbol: 'USDJPY', market: 'FX', shares: 1000, avg_cost: 140 }),
    ], priceMap(quote({ symbol: 'USDJPY', market: 'FX', price: 150, currency: 'JPY' })), usdJpy);
    expect(result[0]).toMatchObject({
      current_value: 150000, current_value_jpy: 150000, profit_loss: 10000,
    });
    expect(computeSummary(result, usdJpy)).toMatchObject({
      fx_value_usd: 0, fx_value_jpy: 150000, total_cost_jpy: 140000,
    });
  });

  it('日本株は円の評価額とマイナス損益を保持する', () => {
    const result = computeHoldingsWithPrices([
      holding({ symbol: '7203', market: 'JP', shares: 100, avg_cost: 2000 }),
    ], priceMap(quote({ symbol: '7203', market: 'JP', price: 1800, change_percent: -2 })), usdJpy);
    expect(result[0]).toMatchObject({ current_value_jpy: 180000, profit_loss: -20000, profit_loss_percent: -10 });
    expect(computeSummary(result, usdJpy)).toMatchObject({ jp_stock_value_jpy: 180000, daily_change: -3600 });
  });

  it('USD・JPYの現金は価格取得なしで評価し損益を0とする', () => {
    const result = computeHoldingsWithPrices([
      holding({ id: 'usd', symbol: 'CASH', shares: 100, avg_cost: 999 }),
      holding({ id: 'jpy', symbol: 'CASH', market: 'JP', shares: 5000, avg_cost: 999 }),
    ], {}, usdJpy);
    expect(result.map((item) => item.price_status)).toEqual(['cash', 'cash']);
    expect(result.map((item) => item.current_price)).toEqual([1, 1]);
    expect(result.map((item) => item.current_value_jpy)).toEqual([15000, 5000]);
    expect(result.map((item) => item.profit_loss)).toEqual([0, 0]);
    expect(computeSummary(result, usdJpy)).toMatchObject({
      total_value_jpy: 20000, total_cost_jpy: 20000, cash_value_usd: 100,
      cash_value_jpy: 20000, total_profit_loss: 0, daily_change: 0, missing_price_count: 0,
    });
  });

  it('未取得価格の評価額は取得額とし、損益・損益率の集計から除外する', () => {
    const result = computeHoldingsWithPrices([
      holding(),
      holding({ id: 'missing-us', symbol: 'MISSING', shares: 2, avg_cost: 50 }),
      holding({ id: 'missing-jp', symbol: '9999', market: 'JP', shares: 10, avg_cost: 100 }),
    ], priceMap(quote()), usdJpy);
    for (const item of result.slice(1)) {
      expect(item.price_status).toBe('missing');
      expect(item.current_price).toBeUndefined();
      expect(item.profit_loss).toBeUndefined();
      expect(item.profit_loss_percent).toBeUndefined();
      expect(item.change_percent).toBeUndefined();
    }
    expect(result[1].current_value).toBe(100);
    expect(result[1].current_value_jpy).toBe(15000);
    expect(computeSummary(result, usdJpy)).toMatchObject({
      total_value_jpy: 196000, total_cost_jpy: 150000,
      total_profit_loss: 30000, total_profit_loss_percent: 20,
      missing_price_count: 2, daily_change: 3600,
    });
  });

  it('未取得FXもクォート通貨に合わせて取得額を円換算する', () => {
    const result = computeHoldingsWithPrices([
      holding({ symbol: 'EURUSD', market: 'FX', shares: 100, avg_cost: 1.1 }),
      holding({ symbol: 'EURJPY', market: 'FX', shares: 100, avg_cost: 160 }),
    ], {}, usdJpy);
    expect(result[0].current_value_jpy).toBeCloseTo(16500);
    expect(result[1].current_value_jpy).toBe(16000);
    expect(computeSummary(result, usdJpy)).toMatchObject({
      missing_price_count: 2, total_cost_jpy: 0, total_profit_loss: 0, total_profit_loss_percent: 0,
    });
  });

  it('日次損益率は既存の総資産から日次損益を引く式を維持する', () => {
    const result = computeHoldingsWithPrices([
      holding(),
      holding({ symbol: 'CASH', market: 'JP', shares: 20000 }),
      holding({ symbol: 'MISSING', market: 'JP', shares: 10, avg_cost: 100 }),
    ], priceMap(quote()), usdJpy);
    const summary = computeSummary(result, usdJpy);
    expect(summary.daily_change).toBe(3600);
    expect(summary.daily_change_percent).toBeCloseTo(3600 / (201000 - 3600) * 100);
  });

  it('同一シンボルでも市場ごとの価格を参照する', () => {
    const result = computeHoldingsWithPrices([
      holding({ symbol: 'ABC' }), holding({ symbol: 'ABC', market: 'JP' }),
    ], priceMap(quote({ symbol: 'ABC', price: 120 }), quote({ symbol: 'ABC', market: 'JP', price: 500 })), usdJpy);
    expect(result.map((item) => item.current_price)).toEqual([120, 500]);
  });

  it('空の保有では合計と割合が0になる', () => {
    const result = computeHoldingsWithPrices([], {}, usdJpy);
    expect(Object.values(computeSummary(result, usdJpy)).every((value) => value === 0)).toBe(true);
    expect(computeSectorAllocation(result, 0)).toEqual([]);
    expect(computeHoldingAllocation(result, 0)).toEqual([]);
  });

  it('取得額が0でも損益率は有限の0になる', () => {
    const result = computeHoldingsWithPrices([holding({ avg_cost: 0 })], priceMap(quote()), usdJpy);
    expect(result[0].profit_loss_percent).toBe(0);
    expect(computeSummary(result, usdJpy).total_profit_loss_percent).toBe(0);
  });
});

describe('配分計算', () => {
  it('現金とFXを独立して分類し、価格未取得も含め合計100%になる', () => {
    const result = computeHoldingsWithPrices([
      holding({ sector: 'Technology' }),
      holding({ id: 'cash', symbol: 'CASH', market: 'JP', shares: 20000, sector: 'technology' }),
      holding({ id: 'fx', symbol: 'USDJPY', market: 'FX', shares: 100, avg_cost: 140, sector: 'technology' }),
      holding({ id: 'missing', symbol: '9999', market: 'JP', shares: 10, avg_cost: 1000, sector: 'invalid' }),
    ], priceMap(quote(), quote({ symbol: 'USDJPY', market: 'FX', price: 150 })), usdJpy);
    const summary = computeSummary(result, usdJpy);
    const allocation = computeSectorAllocation(result, summary.total_value_jpy);
    expect(allocation.map(({ sector, value, label }) => ({ sector, value, label }))).toEqual([
      { sector: 'technology', value: 180000, label: '情報技術' },
      { sector: 'cash', value: 20000, label: '現金' },
      { sector: 'fx', value: 15000, label: 'FX' },
      { sector: 'other', value: 10000, label: '未分類' },
    ]);
    expect(allocation.reduce((sum, item) => sum + item.percent, 0)).toBeCloseTo(100);
    expect(allocation.every((item) => Boolean(item.color))).toBe(true);
    expect(computeSectorAllocation(result, 0).every((item) => item.percent === 0)).toBe(true);
  });

  it('銘柄別配分は口座をまたいで集約し、市場を分け、評価額の降順にする', () => {
    const result = computeHoldingsWithPrices([
      holding(), holding({ id: 'other-account', portfolio_id: 'other', shares: 5 }),
      holding({ id: 'jp', symbol: 'AAPL', market: 'JP', shares: 1, avg_cost: 100 }),
      holding({ id: 'zero', symbol: 'ZERO', avg_cost: 0 }),
    ], priceMap(quote()), usdJpy);
    const allocation = computeHoldingAllocation(result, computeSummary(result, usdJpy).total_value_jpy);
    expect(allocation).toHaveLength(2);
    expect(allocation[0]).toMatchObject({ symbol: 'AAPL', market: 'US', value: 270000 });
    expect(allocation[1]).toMatchObject({ symbol: 'AAPL', market: 'JP', value: 100 });
    expect(allocation.reduce((sum, item) => sum + item.percent, 0)).toBeCloseTo(100);
    expect(computeHoldingAllocation(result, 0).every((item) => item.percent === 0)).toBe(true);
  });
});
