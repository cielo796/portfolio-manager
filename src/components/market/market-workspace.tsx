'use client';

import { usePageRefresh } from '@/components/shell/refresh-context';
import { Heatmap } from './heatmap';
import { QuotePanels } from './quote-panels';
import { SectorPanel } from './sector-panel';
import { useMarketWorkspace } from './use-market-workspace';

export function MarketWorkspace() {
  const data = useMarketWorkspace();
  usePageRefresh(data.refresh, data.loading || (data.period !== 'day' && data.chartLoading), data.updatedAt);
  return <div className="flex min-h-full min-w-0 flex-col gap-1">
    <h1 className="sr-only">マーケット</h1>
    <QuotePanels snapshot={data.snapshot} lines={data.lines} loading={data.loading} error={data.errors.market}
      lineError={data.errors.lines || (!data.loading && data.lines.some((line) => line.closes.length < 2))} />
    <div className="grid flex-1 grid-cols-1 items-start gap-1 min-[1200px]:grid-cols-[minmax(390px,1fr)_minmax(0,1.4fr)]">
      <SectorPanel snapshot={data.snapshot} charts={data.charts} period={data.period} setPeriod={data.setPeriod}
        loading={data.period === 'day' ? data.loading && !data.snapshot : data.chartLoading}
        error={data.period === 'day' ? data.errors.market : data.errors.charts} />
      <Heatmap tiles={data.tiles} loading={data.loading} loaded={data.heatLoaded} error={data.errors.heat} />
    </div>
  </div>;
}
