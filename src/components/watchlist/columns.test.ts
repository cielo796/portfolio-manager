import { describe, expect, it } from 'vitest';
import { formatVolume, formatWatchlistCell, targetGap, type WatchlistRow } from './columns';

const row: WatchlistRow = {
  item: { id: 'test', symbol: 'AAPL', market: 'US', list_key: 'main', sort_order: 0, created_at: '', updated_at: '' },
};

describe('登録銘柄の表示', () => {
  it('出来高は市場ごとの単位で表示し、0と欠損を区別する', () => {
    expect(formatVolume(52400000, 'US')).toBe('52.4M');
    expect(formatVolume(6800000000, 'US')).toBe('6.8B');
    expect(formatVolume(21000, 'JP')).toBe('2.1万');
    expect(formatVolume(210000000, 'JP')).toBe('2.1億');
    expect(formatVolume(0, 'US')).toBe('0');
    for (const value of [null, undefined, NaN, -1]) expect(formatVolume(value, 'JP')).toBe('—');
  });

  it('目標価格は未設定を明示し、現在値欠損時は距離を計算しない', () => {
    expect(formatWatchlistCell(row, 'target')).toBe('未設定');
    expect(formatWatchlistCell(row, 'price')).toBe('—');
    expect(formatWatchlistCell(row, 'pe')).toBe('—');
    expect(targetGap({ ...row, item: { ...row.item, target_price: 103 } })).toBeUndefined();
    const priced = { ...row, item: { ...row.item, target_price: 103 }, price: {
      symbol: 'AAPL', market: 'US' as const, name: 'Apple', price: 100, change: 2, change_percent: 2, currency: 'USD', updated_at: '',
    } };
    expect(targetGap(priced)).toBeCloseTo(3);
    expect(formatWatchlistCell(priced, 'toTarget')).toBe('+3.00%');
    expect(formatWatchlistCell({ ...priced, sparkline: { symbol: 'AAPL', market: 'US', closes: [], high52w: 125 } }, 'fromHigh')).toBe('-20.00%');
  });
});
