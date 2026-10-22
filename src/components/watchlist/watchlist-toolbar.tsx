'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import { Eye, Layers, Search } from 'lucide-react';
import { SECTORS } from '@/lib/sectors';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WATCHLIST_TABS } from './constants';

type WatchlistToolbarProps = Pick<WatchlistState,
  | 'activeListKey'
  | 'visibleItemCount'
  | 'activeItems'
  | 'sortActiveListBySector'
  | 'isSavingLayout'
>;

export const WatchlistToolbar = ({
  activeListKey,
  visibleItemCount,
  activeItems,
  sortActiveListBySector,
  isSavingLayout,
}: WatchlistToolbarProps) => {
  return (
    <CardHeader className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Eye className="w-5 h-5 text-blue-400" />
        <CardTitle>{WATCHLIST_TABS.find((tab) => tab.key === activeListKey)?.label}の銘柄</CardTitle>
        <span className="text-sm tabular-nums text-slate-400">{visibleItemCount} / {activeItems.length}</span>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={sortActiveListBySector}
          disabled={isSavingLayout || activeItems.length === 0}
        >
          <Layers className="w-4 h-4" />
          セクター順に整列
        </Button>
        <span className="hidden text-xs text-slate-400 xl:inline">
          {isSavingLayout ? '並び順を保存中...' : 'ドラッグで並び替え'}
        </span>
      </div>
    </CardHeader>
  );
};

type WatchlistFiltersProps = Pick<WatchlistState,
  | 'searchQuery'
  | 'setSearchQuery'
  | 'sectorFilter'
  | 'setSectorFilter'
  | 'activeItems'
  | 'sectorCounts'
>;

export const WatchlistFilters = ({
  searchQuery,
  setSearchQuery,
  sectorFilter,
  setSectorFilter,
  activeItems,
  sectorCounts,
}: WatchlistFiltersProps) => {
  return (
    <>
    <div className="relative mb-4 max-w-md">
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
      <input type="search" aria-label="銘柄を検索" placeholder="銘柄コード・会社名・メモで検索" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600/60 bg-slate-900/50 pr-3 pl-10 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={sectorFilter === 'all'}
        onClick={() => setSectorFilter('all')}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          sectorFilter === 'all'
            ? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
            : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
        }`}
      >
        すべて
        <span className="ml-1.5 text-slate-400">{activeItems.length}</span>
      </button>
      {SECTORS.filter((definition) => (sectorCounts.get(definition.key) ?? 0) > 0).map(
        (definition) => (
          <button
            key={definition.key}
            type="button"
            aria-pressed={sectorFilter === definition.key}
            onClick={() => setSectorFilter(definition.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              sectorFilter === definition.key
                ? definition.badgeClass
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
            }`}
          >
            {definition.label}
            <span className="ml-1.5 text-slate-400">
              {sectorCounts.get(definition.key) ?? 0}
            </span>
          </button>
        )
      )}
    </div>
    </>
  );
};
