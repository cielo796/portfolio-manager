'use client';

import { RefreshCw } from 'lucide-react';
import { useWatchlist } from '@/hooks/use-watchlist';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { Card } from '@/components/ui/card';
import { AddWatchItemForm } from '@/components/watchlist/add-watch-item-form';
import { TradeIdeasPanel } from '@/components/watchlist/trade-ideas-panel';
import { WatchlistHeader } from '@/components/watchlist/watchlist-header';
import { WatchlistListHeader } from '@/components/watchlist/watchlist-tabs';
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
    <div className="p-2">
      <WatchlistHeader {...watchlist} />

      <div className="flex flex-col gap-6">
        <div className="space-y-6">
          <Card>
            <WatchlistListHeader {...watchlist} />
            <AddWatchItemForm {...watchlist} />
          </Card>

          <WatchlistTable {...watchlist} />
        </div>

        <TradeIdeasPanel {...watchlist} />
      </div>
    </div>
  );
}
