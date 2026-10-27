import { describe, expect, it } from 'vitest';
import type { TopPickView } from '@/types';
import { topPickPerformance, topPicksSummary } from './top-picks-calc';

const pick = { id: 'one', symbol: 'NVDA', market: 'US', picked_price: 100, current_price: 120,
  benchmark_at_pick: 5000, current_benchmark: 5500, target_price: 150,
  removed_at: null, removed_price: null, benchmark_at_remove: null,
  review_on: '2026-11-01', next_earnings_date: '2026-10-28' } as TopPickView;

describe('トップピックの成績', () => {
  it('騰落率・同期間のS&P500比・目標までを小数の割合で計算する', () => {
    const result = topPickPerformance(pick);
    expect(result.change).toBeCloseTo(0.2);
    expect(result.alpha).toBeCloseTo(0.1);
    expect(result.toTarget).toBeCloseTo(0.25);
  });
  it('外した時点の価格と指数を使い、以降の相場に影響されない', () => {
    const result = topPickPerformance({ ...pick, removed_at: '2026-10-22T12:00:00Z', removed_price: 90,
      benchmark_at_remove: 5250, current_price: 500, current_benchmark: 10000 });
    expect(result.change).toBeCloseTo(-0.1);
    expect(result.alpha).toBeCloseTo(-0.15);
  });
  it.each(['benchmark_at_pick', 'current_benchmark'] as const)('%sが無ければS&P比はnull', (key) => {
    expect(topPickPerformance({ ...pick, [key]: null })).toMatchObject({ change: 0.2, alpha: null });
  });
  it('外した日の指数が無ければ現在の指数で補わない', () => {
    expect(topPickPerformance({ ...pick, removed_at: '2026-10-22', removed_price: 120 }).alpha).toBeNull();
  });
  it('価格未取得やゼロで損益0や無限大を表示しない', () => {
    expect(topPickPerformance({ ...pick, current_price: null })).toEqual({ change: null, alpha: null, toTarget: null });
    expect(topPickPerformance({ ...pick, picked_price: 0 }).change).toBeNull();
    expect(topPickPerformance({ ...pick, current_price: 0 }).toTarget).toBeNull();
    expect(topPickPerformance({ ...pick, target_price: null }).toTarget).toBeNull();
  });
  it('既知の値だけを平均し、次回決算日と見直し日を比較する', () => {
    const result = topPicksSummary([pick, { ...pick, id: 'two', symbol: 'AMD', current_price: 80, benchmark_at_pick: null,
      review_on: '2026-10-25', next_earnings_date: '2026-10-01' }, { ...pick, current_price: null, review_on: null, next_earnings_date: null }], '2026-10-23');
    expect(result).toMatchObject({ count: 3, winners: 1, pricedCount: 2, nextReview: { date: '2026-10-25', symbol: 'AMD', reason: '見直し' } });
    expect(result.averageChange).toBeCloseTo(0);
    expect(result.averageAlpha).toBeCloseTo(0.1);
    expect(topPicksSummary([pick], '2026-10-23').nextReview?.reason).toBe('決算');
  });
  it('期限を過ぎた見直しは残し、空の一覧は未取得にする', () => {
    expect(topPicksSummary([{ ...pick, review_on: '2026-10-01' }], '2026-10-23').nextReview?.date).toBe('2026-10-01');
    expect(topPicksSummary([], '2026-10-23')).toMatchObject({ count: 0, averageChange: null, averageAlpha: null, winners: 0, nextReview: null });
  });
});
