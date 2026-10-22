'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import { WATCHLIST_TABS } from './constants';

type WatchlistTabsProps = Pick<WatchlistState,
  'watchlistItems' | 'activeListKey' | 'setActiveListKey' | 'setSectorFilter' | 'cancelEdit' | 'moveDraggedItemToList' | 'handleDragEnd'
>;

export const WatchlistTabs = (props: WatchlistTabsProps) => (
  <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--pm-border)] px-2" aria-label="登録リスト">
    {WATCHLIST_TABS.map((tab) => {
      const count = props.watchlistItems.filter((item) => item.list_key === tab.key).length;
      const active = props.activeListKey === tab.key;
      return <button key={tab.key} type="button" aria-pressed={active} aria-label={`${tab.label} ${count}銘柄`}
        onClick={() => { props.setActiveListKey(tab.key); props.setSectorFilter('all'); props.cancelEdit(); }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); props.moveDraggedItemToList(tab.key); props.handleDragEnd(); }}
        className={`h-7 border-b-2 px-3 ${active ? 'border-[var(--pm-accent)] font-semibold text-[var(--pm-active-text)]' : 'border-transparent pm-muted hover:text-[var(--pm-text)]'}`}>
        {tab.label}<span className="ml-2 tabular-nums">{count}</span>
      </button>;
    })}
    <span className="ml-auto py-1 text-[11px] pm-muted">ドラッグで並べ替え・別リストへ移動</span>
  </div>
);
