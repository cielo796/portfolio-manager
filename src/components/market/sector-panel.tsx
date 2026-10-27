import type { ChartData, MarketSnapshot, SectorPeriod } from '@/types';
import { formatPercent, getProfitLossColor } from '@/lib/utils';
import { sectorReturn } from './model';
import { MarketMessage, MarketPanel, MarketToggle } from './panel';
import { SECTOR_TARGETS } from './symbols';

export function SectorPanel({ snapshot, charts, period, setPeriod, loading, error }: {
  snapshot?: MarketSnapshot; charts: Record<string, ChartData>; period: SectorPeriod;
  setPeriod: (period: SectorPeriod) => void; loading: boolean; error: boolean;
}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const rows = SECTOR_TARGETS.map((target) => {
    const item = snapshot?.items.find((item) => item.key === target.key);
    return {
      ...target,
      percent: period === 'day' ? item?.changePercent : sectorReturn(charts[target.key]?.candles ?? [], period, today),
      stale: period === 'day' ? snapshot?.failed.includes(target.key) && !!item : charts[target.key]?.stale,
    };
  }).sort((a, b) => (b.percent ?? -Infinity) - (a.percent ?? -Infinity));
  const max = Math.max(...rows.map((row) => Math.abs(row.percent ?? 0)), 0.01);
  return <MarketPanel title="米国セクター別騰落（セクターETF）" controls={<MarketToggle label="期間" value={period} options={[
    ['day', '1日'], ['week', '1週'], ['month', '1か月'], ['ytd', '年初来'],
  ]} onChange={setPeriod} />}>
    {loading ? <MarketMessage>セクター騰落を取得中…</MarketMessage> : <div className="space-y-0 px-2.5 py-1.5" role="list" aria-label="騰落率の高い順">
      {rows.map((row) => {
        const width = Math.abs(row.percent ?? 0) / max * 50;
        return <div key={row.key} role="listitem" className="grid grid-cols-[36px_108px_minmax(35px,1fr)_68px] items-center gap-2" style={{ minHeight: 'var(--pm-row-h)' }}>
          <span className="text-[11px] pm-muted">{row.key}</span><span className="truncate" title={row.name}>{row.name}</span>
          <div aria-hidden="true" className="relative h-3"><span className="absolute -top-1.5 bottom-[-6px] left-1/2 w-px bg-[var(--pm-input-border)]" />
            {row.percent !== undefined && <span className="absolute top-0 h-3 rounded-sm" style={{ left: `${row.percent >= 0 ? 50 : 50 - width}%`, width: `${width}%`, background: `var(--pm-${row.percent >= 0 ? 'up' : 'down'})` }} />}
          </div>
          <span title={row.stale ? '取得失敗・前回値' : undefined} className={`num text-[11px] ${row.percent === undefined ? 'pm-muted' : getProfitLossColor(row.percent)}`}>{row.percent === undefined ? '未取得' : formatPercent(row.percent)}{row.stale && <span className="ml-1 pm-muted">*</span>}</span>
        </div>;
      })}
    </div>}
    {!loading && (error || rows.some((row) => row.percent === undefined || row.stale)) && <MarketMessage error>未取得・前回値（*）を含みます。価格更新で再試行できます。</MarketMessage>}
    {period !== 'day' && <p className="px-2.5 pb-2 text-[10px] pm-muted">終値比・米国日付基準。休場日は直前営業日を使用。年初来は前年最終終値比。</p>}
  </MarketPanel>;
}
