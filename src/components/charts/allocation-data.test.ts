import { describe, expect, it } from 'vitest';
import { SECTORS } from '@/lib/sectors';
import { ALLOCATION_PALETTE, ALLOCATION_SECTOR_COLORS, groupAllocationItems, type AllocationItem } from './allocation-data';

const item = (index: number, value: number): AllocationItem => ({ key: `item-${index}`, label: `銘柄${index}`, value, percent: -1 });

describe('ドーナツの表示データ', () => {
  it('評価額順の上位9件とその他に集約し、元の配列を変更しない', () => {
    const items = Array.from({ length: 12 }, (_, index) => item(index, index + 1));
    const grouped = groupAllocationItems(items);
    expect(grouped).toHaveLength(10);
    expect(grouped.slice(0, 9).map((entry) => entry.value)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4]);
    expect(grouped[9]).toMatchObject({ label: 'その他', value: 6 });
    expect(grouped.reduce((sum, entry) => sum + entry.value, 0)).toBe(78);
    expect(grouped.reduce((sum, entry) => sum + entry.percent, 0)).toBeCloseTo(100);
    expect(items[0]).toEqual(item(0, 1));
  });

  it('9件以下は集約せず、10件目からその他にする', () => {
    expect(groupAllocationItems(Array.from({ length: 9 }, (_, index) => item(index, 1)))).toHaveLength(9);
    expect(groupAllocationItems(Array.from({ length: 10 }, (_, index) => item(index, 1)))[9].label).toBe('その他');
  });

  it('ゼロ、負数、非有限値を除き、正の値を基準に割合を計算し直す', () => {
    const grouped = groupAllocationItems([item(0, 0), item(1, -1), item(2, NaN), item(3, Infinity), item(4, 2), item(5, 1)]);
    expect(grouped.map((entry) => entry.key)).toEqual(['item-4', 'item-5']);
    expect(grouped.reduce((sum, entry) => sum + entry.percent, 0)).toBeCloseTo(100);
    expect(groupAllocationItems([])).toEqual([]);
    expect(groupAllocationItems([item(0, 0)])).toEqual([]);
  });

  it('セクター色を既存の定義順で固定し、順位や他の銘柄の有無で変えない', () => {
    for (const [index, sector] of SECTORS.entries()) {
      expect(ALLOCATION_SECTOR_COLORS[sector.key]).toBe(ALLOCATION_PALETTE[index % ALLOCATION_PALETTE.length]);
    }
    const a = { ...item(0, 10), color: ALLOCATION_SECTOR_COLORS.technology };
    const b = { ...item(1, 20), color: ALLOCATION_SECTOR_COLORS.healthcare };
    expect(groupAllocationItems([a, b]).find((entry) => entry.key === a.key)?.color).toBe(groupAllocationItems([a])[0].color);
    expect(groupAllocationItems([a])[0].color).toBe(groupAllocationItems([{ ...a, value: 30 }, b])[0].color);
    expect(groupAllocationItems([item(0, 1)])[0].color).toBe(groupAllocationItems([item(1, 2), item(0, 1)])[1].color);
  });
});
