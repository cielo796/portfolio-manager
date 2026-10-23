import { describe, expect, it } from 'vitest';
import type { PortfolioSnapshot } from '@/types';
import { closeOnOrBefore, comparisonSeries, historyCsv, historyMetrics, historySegments, indexed, monthlyRows, rangeStart, snapshotId, validSnapshot } from './model';

const row = (date: string, value: number): PortfolioSnapshot => ({ id: snapshotId(date, null), snapshot_date: date, portfolio_id: null,
  market_value_jpy: value, cost_basis_jpy: 80, cash_jpy: 0, usd_jpy: 150, is_estimate: 0,
  created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`, deleted_at: null, updated_by: null });

describe('資産推移の集計', () => {
  it('Asia/Tokyoの日付を受け取って決定的IDを作る', () => {
    expect(snapshotId('2026-10-23', null)).toBe('2026-10-23|ALL');
    expect(snapshotId('2026-10-23', 'account')).toBe('2026-10-23|account');
    expect(validSnapshot(row('2026-02-30', 100))).toBe(false);
    expect(validSnapshot(row('2026-02-28', Infinity))).toBe(false);
  });
  it('月末を切り詰め、YTD・全期間に対応する', () => {
    expect(rangeStart('1M', '2024-03-31')).toBe('2024-02-29');
    expect(rangeStart('1Y', '2024-02-29')).toBe('2023-02-28');
    expect(rangeStart('YTD', '2026-10-23')).toBe('2026-01-01');
    expect(rangeStart('全期間', '2026-10-23')).toBe('0000-01-01');
  });
  it('期間騰落率とピークからの最大下落を計算し、1点・ゼロ基準を扱う', () => {
    const points = [100, 120, 90, 110].map((value, i) => ({ date: `2026-10-0${i + 1}`, value }));
    expect(historyMetrics(points).periodReturn).toBeCloseTo(10);
    expect(historyMetrics(points).maxDrawdown).toBe(-25);
    expect(historyMetrics([])).toEqual({ periodReturn: null, maxDrawdown: null });
    expect(historyMetrics(points.slice(0, 1)).periodReturn).toBeNull();
    expect(indexed([{ date: '2026-10-01', value: 0 }])).toEqual([]);
  });
  it('共通日を100とし、S&P500の円換算と現地通貨を切り替える', () => {
    const rows = [row('2026-10-01', 200), row('2026-10-02', 220)];
    const sp = [{ date: '2026-10-01', value: 5000 }, { date: '2026-10-02', value: 5500 }];
    const jp = [{ date: '2026-10-01', value: 30000 }, { date: '2026-10-02', value: 33000 }];
    const fx = [{ date: '2026-10-01', value: 100 }, { date: '2026-10-02', value: 110 }];
    expect(comparisonSeries(rows, sp, jp, fx, true).sp500[1].value).toBeCloseTo(121);
    expect(comparisonSeries(rows, sp, jp, fx, false).sp500[1].value).toBeCloseTo(110);
    expect(comparisonSeries(rows, sp.slice(1), jp, fx, true).portfolio).toEqual([{ date: '2026-10-02', value: 100 }]);
    expect(closeOnOrBefore(sp, '2026-10-03')).toBe(5500);
    expect(closeOnOrBefore(sp, '2026-10-10')).toBeNull();
    expect(closeOnOrBefore(sp, '2026-09-30')).toBeNull();
  });
  it('各月の最終記録とCSVを作り、欠けた月の前月比を表示しない', () => {
    const rows = [row('2026-07-30', 100), row('2026-07-31', 120), row('2026-08-31', 150), row('2026-10-23', 180)];
    expect(monthlyRows(rows).map((item) => item.change)).toEqual([null, 25, null]);
    expect(historyCsv(rows)).toContain('2026-08,2026-08-31,150,25,80,70,実測');
  });
  it('実測と推計が交互でも各線分の種類を保ち、境界だけを共有する', () => {
    const points = [1, 2, 3, 4].map((value) => ({ date: `2026-10-0${value}`, value }));
    const segments = historySegments(points, new Set(['2026-10-01', '2026-10-03']));
    expect(segments.map((segment) => [segment.estimate, segment.points.map((point) => point.value)]))
      .toEqual([[true, [1]], [false, [1, 2]], [true, [2, 3]], [false, [3, 4]]]);
  });
});
