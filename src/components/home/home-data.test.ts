import { describe, expect, it } from 'vitest';
import { computeHoldingsWithPrices, computeSummary } from '@/lib/portfolio-calc';
import type { FundamentalMetrics, Holding } from '@/types';
import { HOME_MARKETS, formatNewsTime, marketAllocation, sparklinePoints, upcomingEarnings } from './home-data';

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
