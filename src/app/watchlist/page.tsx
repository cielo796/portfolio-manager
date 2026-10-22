'use client';

import { RefreshCw } from 'lucide-react';
import { useWatchlist } from '@/hooks/use-watchlist';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { TradeIdeasPanel } from '@/components/watchlist/trade-ideas-panel';
import { WatchlistHeader } from '@/components/watchlist/watchlist-header';
import { WatchlistTable } from '@/components/watchlist/watchlist-table';

export default function WatchlistPage() {
  const watchlist = useWatchlist();
  const { isLoading } = watchlist;
  usePageRefresh(watchlist.refreshWatchPrices, watchlist.isRefreshingPrices, watchlist.lastPriceUpdatedAt, !isLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-400">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-1 min-[900px]:h-full">
      <WatchlistHeader {...watchlist} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-1 min-[900px]:grid-cols-[minmax(0,1fr)_290px]">
        <WatchlistTable {...watchlist} />
        <TradeIdeasPanel {...watchlist} />
      </div>
    </div>
  );
}
