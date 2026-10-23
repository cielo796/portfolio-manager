import { describe, expect, it } from 'vitest';
import { computeHoldingsWithPrices, computeSummary } from '@/lib/portfolio-calc';
import type { FundamentalMetrics, Holding, StockPrice } from '@/types';
import { ALLOCATION_SECTOR_COLORS, CASH_ALLOCATION_COLOR, groupAllocationItems } from '@/components/charts/allocation-data';
import { HOME_MARKETS, formatNewsTime, marketAllocation, portfolioAllocation, sparklinePoints, upcomingEarnings } from './home-data';

describe('ホームの表示データ', () => {
  it('6指数の履歴は指数市場とFX市場を指定する', () => {
    expect(HOME_MARKETS).toHaveLength(6);
    expect(HOME_MARKETS.filter((item) => item.market === 'FX')).toEqual([
      { key: 'USDJPY=X', symbol: 'USDJPY', market: 'FX', name: 'USD/JPY' },
    ]);
    expect(HOME_MARKETS.filter((item) => item.market === 'INDEX')).toHaveLength(5);
  });

  it('空・単一点・一定値・欠損を含む履歴から有限の座標だけを作る', () => {
    expect(sparklinePoints([])).toBe('');
    expect(sparklinePoints([1])).toBe('');
    expect(sparklinePoints([10, 10, 10])).toBe('0,16 80,16 160,16');
    expect(sparklinePoints([10, NaN, 20, Infinity, 15])).toBe('0,30 80,2 160,16');
  });

  const holding = (symbol: string, market: Holding['market']): Holding => ({
    id: `${symbol}-${market}`, portfolio_id: 'account', symbol, market, shares: 1, avg_cost: 10,
    created_at: '', updated_at: '', sort_order: 0,
  });
  const holdings = computeHoldingsWithPrices([
    holding('AAPL', 'US'), holding('MSFT', 'US'), holding('NVDA', 'US'), holding('CASH', 'US'), holding('7203', 'JP'), holding('USDJPY', 'FX'),
  ], {}, 150);
  const metrics = (symbol: string, date: string): FundamentalMetrics => ({ symbol, market: 'US', updated_at: '', source: 'yahoo_finance', next_earnings_date: date });

  it('決算は当日から21日後まで、米国株のみ、重複せず日付順で表示する', () => {
    const rows = upcomingEarnings([...holdings, holdings[0]], {
      'AAPL|US': metrics('AAPL', '2026-11-13'), 'MSFT|US': metrics('MSFT', '2026-10-23'),
      'NVDA|US': metrics('NVDA', '2026-11-14'), '7203|JP': metrics('7203', '2026-10-24'),
      'CASH|US': metrics('CASH', '2026-10-24'), 'USDJPY|FX': metrics('USDJPY', '2026-10-24'),
    }, '2026-10-23');
    expect(rows.map((row) => [row.symbol, row.date])).toEqual([['MSFT', '2026-10-23'], ['AAPL', '2026-11-13']]);
  });

  it('過去・無効・未取得の決算日は表示しない', () => {
    expect(upcomingEarnings(holdings, { 'AAPL|US': metrics('AAPL', '2026-10-22'), 'MSFT|US': metrics('MSFT', 'invalid') }, '2026-10-23')).toEqual([]);
  });

  it('市場別の現金を株式から分離し、配分の合計を100%にする', () => {
    const allocations = marketAllocation(computeSummary(holdings, 150));
    expect(allocations.map((item) => item.label)).toEqual(['米国株', '日本株', 'FX', '現金']);
    expect(allocations.reduce((sum, item) => sum + item.percent, 0)).toBeCloseTo(100);
    expect(marketAllocation(computeSummary([], 150))).toEqual([]);
  });
});

describe('共通の配分集計', () => {
  const holding = (id: string, overrides: Partial<Holding> = {}): Holding => ({
    id, portfolio_id: 'account', symbol: 'AAPL', market: 'US', shares: 1, avg_cost: 10,
    sector: 'technology', created_at: '', updated_at: '', sort_order: 0, ...overrides,
  });
  const quote = (symbol: string, market: Holding['market'], price: number): StockPrice => ({
    symbol, market, price, name: symbol, change: 0, change_percent: 0, currency: market === 'US' ? 'USD' : 'JPY', updated_at: '',
  });
  const rows = computeHoldingsWithPrices([
    holding('us-1'), holding('us-2', { portfolio_id: 'other-account', shares: 2 }),
    holding('jp', { market: 'JP' }), holding('missing', { symbol: 'MISSING' }),
    holding('missing-2', { symbol: 'MISSING', portfolio_id: 'other-account' }),
    holding('usd-cash', { symbol: 'CASH', shares: 2 }),
    holding('jpy-cash', { symbol: 'CASH', market: 'JP', shares: 700 }),
    holding('fx', { symbol: 'EURUSD', market: 'FX', sector: undefined, shares: 10 }),
  ], { 'AAPL|US': quote('AAPL', 'US', 20), 'AAPL|JP': quote('AAPL', 'JP', 500), 'EURUSD|FX': quote('EURUSD', 'FX', 1.1) }, 150);

  it('同一symbol|marketを口座横断で合算し、異なる市場は分離して円換算する', () => {
    const data = portfolioAllocation(rows, 150);
    expect(data.holdingItems.find((item) => item.key === 'AAPL|US')?.value).toBe(9000);
    expect(data.holdingItems.find((item) => item.key === 'AAPL|JP')?.value).toBe(500);
    expect(data.holdingItems.find((item) => item.key === 'EURUSD|FX')?.value).toBeCloseTo(1650);
    expect(data.holdingCount).toBe(3);
  });

  it('欠損価格を取得額で代用せず除外し、件数を注記用に返す', () => {
    const data = portfolioAllocation(rows, 150);
    expect(data.missingCount).toBe(2);
    expect(data.holdingItems.some((item) => item.key === 'MISSING|US')).toBe(false);
    expect(data.total).toBeCloseTo(12150);
    expect(data.total).toBe(computeSummary(rows.filter((row) => row.price_status !== 'missing'), 150).total_value_jpy);
    const fullSummary = computeSummary(rows, 150);
    expect(data.total + 3000).toBe(fullSummary.total_value_jpy);
    for (const items of [data.holdingItems, data.sectorItems, data.marketItems]) {
      expect(items.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(data.total);
      expect(groupAllocationItems(items).reduce((sum, item) => sum + item.percent, 0)).toBeCloseTo(100);
    }
  });

  it('価格欠損がない場合はホームの総評価額と一致する', () => {
    const priced = rows.filter((row) => row.price_status !== 'missing');
    expect(portfolioAllocation(priced, 150).total).toBe(computeSummary(priced, 150).total_value_jpy);
  });

  it('現金を灰色にし、セクター色と市場色を絞り込み後も維持する', () => {
    const data = portfolioAllocation(rows, 150);
    expect(data.holdingItems.filter((item) => item.key.startsWith('CASH|')).every((item) => item.label.startsWith('現金') && item.color === CASH_ALLOCATION_COLOR)).toBe(true);
    expect(data.sectorItems.find((item) => item.key === 'cash')).toMatchObject({ label: '現金', value: 1000, color: CASH_ALLOCATION_COLOR });
    expect(data.sectorItems.find((item) => item.key === 'technology')?.color).toBe(ALLOCATION_SECTOR_COLORS.technology);
    const subset = portfolioAllocation(rows.filter((row) => row.market === 'JP'), 150);
    expect(subset.sectorItems.find((item) => item.key === 'technology')?.color).toBe(ALLOCATION_SECTOR_COLORS.technology);
    expect(subset.marketItems.find((item) => item.key === '日本株')?.color).toBe(data.marketItems.find((item) => item.key === '日本株')?.color);
    expect(subset.total).toBe(1200);
    expect(subset.holdingCount).toBe(1);
  });

  it('空データや全件価格欠損でも安全に返す', () => {
    expect(portfolioAllocation([], 150)).toMatchObject({ total: 0, holdingCount: 0, missingCount: 0, holdingItems: [], sectorItems: [], marketItems: [] });
    expect(portfolioAllocation(rows.filter((row) => row.price_status === 'missing'), 150)).toMatchObject({ total: 0, holdingCount: 0, missingCount: 2, holdingItems: [], sectorItems: [], marketItems: [] });
  });
});

describe('ニュースの日時表示', () => {
  const now = new Date('2026-10-23T10:00:00+09:00');

  it('今日は時刻だけ、昨日は月日と時刻を表示する', () => {
    expect(formatNewsTime('2026-10-23T09:05:00+09:00', now)).toBe('09:05');
    expect(formatNewsTime('2026-10-22T23:59:00+09:00', now)).toBe('10/22 23:59');
  });

  it('今日より前の今年の記事は月日を0詰めしない', () => {
    expect(formatNewsTime('2026-01-05T08:00:00+09:00', now)).toBe('1/5 08:00');
  });

  it('日付の判定は Asia/Tokyo 基準で行う', () => {
    expect(formatNewsTime('2026-10-22T15:30:00Z', now)).toBe('00:30');
    expect(formatNewsTime('2026-10-23T15:30:00Z', now)).toBe('10/24 00:30');
  });

  it('年をまたぐ記事は年月日だけを表示する', () => {
    expect(formatNewsTime('2025-12-31T23:30:00+09:00', new Date('2026-01-01T08:00:00+09:00'))).toBe('2025/12/31');
  });

  it('不正な日付は — を返す', () => {
    expect(formatNewsTime('', now)).toBe('—');
    expect(formatNewsTime('invalid', now)).toBe('—');
    expect(formatNewsTime('2026-10-23T09:05:00+09:00', new Date('invalid'))).toBe('—');
  });
});
