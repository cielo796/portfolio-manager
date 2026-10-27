import { describe, expect, it } from 'vitest';
import type { Candle } from '@/types';
import { aggregateCandles, chartRangeStart, get52WeekHighLow, simpleMovingAverage } from './chart-data';

const candle = (date: string, close: number, volume: number | null = 10): Candle => ({
  date, open: close - 1, high: close + 2, low: close - 2, close, volume,
});

describe('日足からのチャート計算', () => {
  it('月曜始まりで週を分け、最初の始値・最後の終値・高安・出来高を集計する', () => {
    const input = [candle('2026-10-26', 20), candle('2026-10-23', 15), candle('2026-10-19', 10), candle('2026-10-18', 9)];
    const original = structuredClone(input);
    expect(aggregateCandles(input, 'w')).toEqual([
      candle('2026-10-18', 9),
      { date: '2026-10-19', open: 9, high: 17, low: 8, close: 15, volume: 20 },
      candle('2026-10-26', 20),
    ]);
    expect(input).toEqual(original);
  });

  it('月替わりと年替わりを区別し、休場日の月初ではなく最初の取引日を日付にする', () => {
    expect(aggregateCandles([candle('2025-12-31', 10), candle('2026-01-02', 20), candle('2026-01-30', 15), candle('2026-02-02', 30)], 'm')).toEqual([
      candle('2025-12-31', 10),
      { date: '2026-01-02', open: 19, high: 22, low: 13, close: 15, volume: 20 },
      candle('2026-02-02', 30),
    ]);
  });

  it('欠損OHLCや出来高を0で埋めず、日足は日付順のコピーを返す', () => {
    const missing = { ...candle('2026-10-19', 10), open: null, high: null, low: null, volume: null };
    const next = candle('2026-10-20', 20);
    expect(aggregateCandles([missing, next], 'w')).toEqual([
      { date: '2026-10-19', open: null, high: 22, low: 18, close: 20, volume: null },
    ]);
    const daily = aggregateCandles([next, missing], 'd');
    expect(daily).toEqual([missing, next]);
    expect(daily[0]).not.toBe(missing);
  });

  it('指定期間の単純移動平均を計算し、データ不足はnullにする', () => {
    expect(simpleMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(simpleMovingAverage([1, 2], 3)).toEqual([null, null]);
    expect(simpleMovingAverage([1, 2], 1)).toEqual([1, 2]);
    for (const period of [0, -1, 1.5, Infinity]) expect(() => simpleMovingAverage([], period)).toThrow(RangeError);
  });

  it('1年内の日足の高値・安値を使い、古い日付と未来の日付を除外する', () => {
    expect(get52WeekHighLow([
      candle('2025-10-22', 1000), candle('2025-10-23', 10), candle('2026-10-23', 20), candle('2026-10-24', 2000),
    ], '2026-10-23')).toEqual({ high52w: 22, low52w: 8 });
    expect(get52WeekHighLow([{ ...candle('2026-10-23', 20), high: null, low: null }], '2026-10-23')).toEqual({});
  });

  it('月末と閏年の期間開始日をその月の最終日に丸める', () => {
    expect(chartRangeStart('3m', '2026-05-31')).toBe('2026-02-28');
    expect(chartRangeStart('1y', '2024-02-29')).toBe('2023-02-28');
    expect(chartRangeStart('5y', '2026-10-23')).toBe('2021-10-23');
  });

  it('空配列を処理できる', () => {
    for (const interval of ['d', 'w', 'm'] as const) expect(aggregateCandles([], interval)).toEqual([]);
    expect(simpleMovingAverage([], 5)).toEqual([]);
    expect(get52WeekHighLow([], '2026-10-23')).toEqual({});
  });
});
