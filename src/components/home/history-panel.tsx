'use client';

import { useDetailResource } from '@/components/detail/data';
import { HistoryChart } from '@/components/history/history-chart';
import type { SnapshotResponse } from '@/components/history/history-workspace';
import { historyMetrics, rangeStart } from '@/components/history/model';
import { formatPercent, getProfitLossColor } from '@/lib/utils';
import { HomePanel, PanelEmpty, PanelError } from './panel';

export function HomeHistory({ revision }: { revision: number }) {
  const resource = useDetailResource<SnapshotResponse>(`/api/snapshots?revision=${revision}`);
  const data = resource.data;
  const rows = data ? data.snapshots.filter((row) => row.snapshot_date >= rangeStart('3M', data.today) && row.snapshot_date <= data.today) : [];
  const { periodReturn } = historyMetrics(rows.map((row) => ({ date: row.snapshot_date, value: row.market_value_jpy })));
  return <HomePanel title="資産推移（直近3か月）" href="/history" link="詳細" bodyClassName="min-[1100px]:flex min-[1100px]:flex-col">
    {resource.loading ? <p role="status" className="p-3 pm-muted">取得中…</p> : resource.error ? <PanelError retry={() => void resource.reload()} />
      : rows.length ? <><p className="shrink-0 px-3 pt-2 pm-muted">期間騰落率 <span className={periodReturn === null ? '' : getProfitLossColor(periodReturn)}>{periodReturn === null ? '—' : formatPercent(periodReturn)}</span> · 淡色破線は参考推移</p><div className="min-[1100px]:min-h-20 min-[1100px]:flex-1 min-[1100px]:[&>div]:h-full min-[1100px]:[&>div>div]:h-full"><HistoryChart rows={rows} compact /></div></>
        : <PanelEmpty>資産記録は価格が揃うと追加されます。</PanelEmpty>}
  </HomePanel>;
}
