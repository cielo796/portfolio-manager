'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import { ChevronDown, ChevronUp, Lightbulb, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

type WatchlistHeaderProps = Pick<WatchlistState,
  | 'lastPriceUpdatedAt'
  | 'refreshWatchPrices'
  | 'isRefreshingPrices'
  | 'watchlistItems'
  | 'setShowIdeas'
  | 'showIdeas'
  | 'tradeIdeas'
>;

export const WatchlistHeader = ({
  lastPriceUpdatedAt,
  refreshWatchPrices,
  isRefreshingPrices,
  watchlistItems,
  setShowIdeas,
  showIdeas,
  tradeIdeas,
}: WatchlistHeaderProps) => {
  return (
    <div className="flex flex-col gap-4 mb-8 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">ウォッチリスト</h1>
        <p className="text-sm text-slate-400 mt-2">
          監視銘柄とトレードアイデアをまとめて管理します。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-400">
          {lastPriceUpdatedAt ? `最終更新: ${formatDate(lastPriceUpdatedAt, 'full')}` : '株価は未更新です'}
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={refreshWatchPrices}
          disabled={isRefreshingPrices || watchlistItems.length === 0}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshingPrices ? 'animate-spin' : ''}`} />
          株価を更新
        </Button>
        <Button type="button" variant="ghost" onClick={() => setShowIdeas(!showIdeas)} aria-expanded={showIdeas} aria-controls="trade-ideas-panel">
          <Lightbulb className="h-4 w-4 text-amber-300" />
          アイデア {tradeIdeas.length}件
          {showIdeas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};
