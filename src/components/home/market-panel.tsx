'use client';

import type { MarketSnapshot, SparklineItem } from '@/types';
import { formatNumber, formatPercent, getProfitLossColor } from '@/lib/utils';
import { HOME_MARKETS, sparklinePoints } from './home-data';
import { HomePanel, PanelError, PanelSkeleton } from './panel';
import { fetchHomeJson, useHomeResource } from './use-home-resource';

const loadMarket = (signal: AbortSignal, retry: boolean) => fetchHomeJson<MarketSnapshot>(`/api/market${retry ? '?refresh=1' : ''}`, signal);
const loadSparklines = (signal: AbortSignal) => fetchHomeJson<{ items: SparklineItem[] }>('/api/sparklines', signal, { items: HOME_MARKETS.map(({ symbol, market }) => ({ symbol, market })), days: 20 });

export function HomeMarket() {
  const market = useHomeResource(loadMarket);
  const sparklines = useHomeResource(loadSparklines);
  const incomplete = !market.loading && HOME_MARKETS.some((target) => !market.data?.items?.some((item) => item.key === target.key));
  const missingLines = !sparklines.loading && HOME_MARKETS.some((target) => !sparklines.data?.items?.some((item) => item.symbol === target.symbol && item.market === target.market && sparklinePoints(item.closes)));
  return <HomePanel title="主要指数・為替" href="/market" link="マーケット">
    {market.loading ? <PanelSkeleton /> : market.error ? <PanelError retry={market.retry} /> : <div className="grid grid-cols-2">
      {HOME_MARKETS.map((target) => {
        const item = market.data?.items?.find((value) => value.key === target.key);
        const line = sparklines.data?.items?.find((value) => value.symbol === target.symbol && value.market === target.market);
        const points = sparklinePoints(line?.closes ?? []);
        const color = item ? getProfitLossColor(item.changePercent) : 'pm-muted';
        return <div key={target.key} className="min-w-0 border-b border-r border-[var(--pm-divider)] px-2.5 py-2">
          <div className="flex flex-wrap items-center justify-between gap-1"><h3 className="font-medium">{target.name}</h3><span className={`num ${color}`}>{item ? formatPercent(item.changePercent) : '価格未取得'}</span></div>
          <p className="num !text-left text-[15px] font-semibold">{item ? `${formatNumber(item.value, target.market === 'FX' ? 3 : 2)}${target.key === '^TNX' ? '%' : ''}` : '—'}</p>
          {sparklines.loading ? <div role="status" aria-label="価格履歴を取得中" className="my-2 h-4 animate-pulse rounded bg-[var(--pm-input-border)]" /> : points ? <svg viewBox="0 0 160 32" width="100%" height="32" preserveAspectRatio="none" role="img" aria-label={`${target.name} 直近20営業日の価格推移`} className={color}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg> : <p className="h-8 py-2 text-[11px] pm-muted">価格履歴未取得</p>}
        </div>;
      })}
    </div>}
    {incomplete && !market.error && <PanelError retry={market.retry} />}
    {(sparklines.error || missingLines) && !market.error && <PanelError retry={sparklines.retry} />}
  </HomePanel>;
}
