'use client';

import type { ReactNode } from 'react';
import type { WatchlistState } from '@/hooks/use-watchlist';
import { RefreshCw } from 'lucide-react';
import { SECTORS } from '@/lib/sectors';

type WatchlistToolbarProps = Pick<WatchlistState,
  'searchQuery' | 'setSearchQuery' | 'sectorFilter' | 'setSectorFilter' | 'sectorCounts' | 'activeItems'
  | 'sortActiveListBySector' | 'isSavingLayout' | 'isRefreshingPrices' | 'refreshWatchPrices'
  | 'showAddForm' | 'setShowAddForm' | 'watchlistItems' | 'visibleItemCount'
> & { columnsMenu: ReactNode };

export function WatchlistToolbar(props: WatchlistToolbarProps) {
  return <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
    <div className="flex flex-wrap items-center gap-1" aria-label="セクターフィルタ">
      {[{ key: 'all' as const, label: 'すべて' }, ...SECTORS.filter((sector) => (props.sectorCounts.get(sector.key) ?? 0) > 0)].map((sector) => (
        <button key={sector.key} type="button" aria-pressed={props.sectorFilter === sector.key} onClick={() => props.setSectorFilter(sector.key)}
          className={`h-[22px] rounded-full border px-2 text-[11px] ${props.sectorFilter === sector.key ? 'border-[#6b5226] bg-[var(--pm-active-bg)] text-[var(--pm-active-text)]' : 'border-[var(--pm-input-border)] bg-[var(--pm-heading)] pm-muted'}`}>
          {sector.label} <span className="tabular-nums">{sector.key === 'all' ? props.activeItems.length : props.sectorCounts.get(sector.key)}</span>
        </button>
      ))}
    </div>
    <input type="search" aria-label="銘柄を検索" placeholder="コード・銘柄名・メモで検索" value={props.searchQuery} onChange={(event) => props.setSearchQuery(event.target.value)} className="ml-auto h-[26px] min-w-40 flex-1 rounded border border-[var(--pm-input-border)] bg-[var(--pm-bg)] px-2 min-[1400px]:max-w-56" />
    <button type="button" className="pm-button" onClick={props.sortActiveListBySector} disabled={props.isSavingLayout || props.activeItems.length === 0}>{props.isSavingLayout ? '保存中…' : 'セクター順に整列'}</button>
    {props.columnsMenu}
    <button type="button" className="pm-button inline-flex items-center gap-1" onClick={props.refreshWatchPrices} disabled={props.isRefreshingPrices || props.watchlistItems.length === 0}>
      <RefreshCw className={`h-3 w-3 ${props.isRefreshingPrices ? 'animate-spin' : ''}`} />{props.isRefreshingPrices ? '更新中…' : '価格・指標を更新'}
    </button>
    <button type="button" className="pm-button !border-[var(--pm-accent)] !bg-[var(--pm-accent)] !text-[#1a1205]" onClick={() => props.setShowAddForm(!props.showAddForm)} aria-expanded={props.showAddForm} aria-controls="watchlist-add-form">{props.showAddForm ? '閉じる' : '＋ 銘柄を追加'}</button>
    <span className="text-[11px] pm-muted">{props.visibleItemCount}/{props.activeItems.length}銘柄</span>
  </div>;
}
