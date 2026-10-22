'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import { formatDate } from '@/lib/utils';

export const WatchlistHeader = ({ lastPriceUpdatedAt }: Pick<WatchlistState, 'lastPriceUpdatedAt'>) => (
  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-1">
    <h1 className="text-sm font-semibold">登録銘柄</h1>
    <span className="pm-muted text-[11px]">{lastPriceUpdatedAt ? `最終更新: ${formatDate(lastPriceUpdatedAt, 'full')}` : '株価は未更新です'}</span>
  </div>
);
