'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import { Layers, Plus, X } from 'lucide-react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WATCHLIST_TABS } from './constants';

type WatchlistTabsProps = Pick<WatchlistState,
  | 'watchlistItems'
  | 'activeListKey'
  | 'setActiveListKey'
  | 'setSectorFilter'
  | 'cancelEdit'
  | 'moveDraggedItemToList'
  | 'handleDragEnd'
>;

export const WatchlistTabs = ({
  watchlistItems,
  activeListKey,
  setActiveListKey,
  setSectorFilter,
  cancelEdit,
  moveDraggedItemToList,
  handleDragEnd,
}: WatchlistTabsProps) => {
  return (
    <div className="flex w-full flex-wrap gap-2 lg:w-auto" aria-label="ウォッチリストの切り替え">
      {WATCHLIST_TABS.map((tab) => {
        const count = watchlistItems.filter((item) => item.list_key === tab.key).length;
        const isActive = activeListKey === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            aria-pressed={isActive}
            aria-label={`${tab.label} ${count}銘柄`}
            onClick={() => { setActiveListKey(tab.key); setSectorFilter('all'); cancelEdit(); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              moveDraggedItemToList(tab.key);
              handleDragEnd();
            }}
            className={`min-w-24 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
                : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500'
            }`}
          >
            {tab.label}
            <span className="ml-2 inline-flex min-w-6 justify-center rounded bg-slate-900/50 px-1.5 py-0.5 text-xs tabular-nums text-slate-300">{count}</span>
          </button>
        );
      })}
    </div>
  );
};

type WatchlistListHeaderProps = Pick<WatchlistState,
  | 'showAddForm'
  | 'setShowAddForm'
> & WatchlistTabsProps;

export const WatchlistListHeader = (props: WatchlistListHeaderProps) => {
  const { showAddForm, setShowAddForm } = props;
  return (
    <CardHeader className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Layers className="w-5 h-5 text-blue-400" />
        <CardTitle>銘柄リスト</CardTitle>
      </div>
      <Button type="button" className="lg:order-last" onClick={() => setShowAddForm(!showAddForm)} aria-expanded={showAddForm} aria-controls="watchlist-add-form">
        {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {showAddForm ? '閉じる' : '銘柄を追加'}
      </Button>
      <WatchlistTabs {...props} />
    </CardHeader>
  );
};
