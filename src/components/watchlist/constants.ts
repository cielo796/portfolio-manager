import { WatchlistKey } from '@/types';
import { SECTORS } from '@/lib/sectors';

export const WATCHLIST_TABS: Array<{ key: WatchlistKey; label: string }> = [
  { key: 'main', label: 'メイン' },
  { key: 'sub1', label: 'サブ1' },
  { key: 'sub2', label: 'サブ2' },
  { key: 'sub3', label: 'サブ3' },
  { key: 'sub4', label: 'サブ4' },
];

export const MARKET_OPTIONS = [
  { value: 'US', label: '米国株' },
  { value: 'JP', label: '日本株' },
  { value: 'FX', label: 'FX' },
];

export const SECTOR_OPTIONS = SECTORS.map((sector) => ({ value: sector.key, label: sector.label }));
