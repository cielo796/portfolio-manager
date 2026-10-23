import { SECTORS } from '@/lib/sectors';

export type AllocationItem = {
  key: string;
  label: string;
  value: number;
  percent: number;
  color?: string;
};

export const ALLOCATION_PALETTE = [
  '#cf9d55', '#71a99a', '#a596bf', '#a8ad70', '#c18f67',
  '#83aaa9', '#b7a18a', '#8e9d76', '#ae98a9', '#c1b270',
  '#8fafa0', '#9e93b0', '#9a958c',
] as const;

export const CASH_ALLOCATION_COLOR = '#89939f';
export const OTHER_ALLOCATION_COLOR = '#737b88';

// 表示順や保有の有無が変わっても、定義順に対応した色を使う。
export const ALLOCATION_SECTOR_COLORS = Object.fromEntries(
  SECTORS.map((sector, index) => [sector.key, ALLOCATION_PALETTE[index % ALLOCATION_PALETTE.length]])
);

export function allocationColor(key: string): string {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return ALLOCATION_PALETTE[hash % ALLOCATION_PALETTE.length];
}

export function groupAllocationItems(items: AllocationItem[]): AllocationItem[] {
  const sorted = items.filter((item) => Number.isFinite(item.value) && item.value > 0)
    .map((item) => ({ ...item, color: item.color ?? allocationColor(item.key) }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  const total = sorted.reduce((sum, item) => sum + item.value, 0);
  const grouped = sorted.length > 9 ? [
    ...sorted.slice(0, 9),
    { key: 'allocation:others', label: 'その他', value: sorted.slice(9).reduce((sum, item) => sum + item.value, 0), percent: 0, color: OTHER_ALLOCATION_COLOR },
  ] : sorted;
  return grouped.map((item) => ({ ...item, percent: total > 0 ? item.value / total * 100 : 0 }));
}
