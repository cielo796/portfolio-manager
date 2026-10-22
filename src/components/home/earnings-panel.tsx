'use client';

import { useCallback } from 'react';
import type { FundamentalMetrics, HoldingWithPrice } from '@/types';
import { upcomingEarnings } from './home-data';
import { HomePanel, PanelEmpty, PanelError, PanelSkeleton } from './panel';
import { fetchHomeJson, useHomeResource } from './use-home-resource';

export function HomeEarnings({ holdings }: { holdings: HoldingWithPrice[] }) {
  const symbols = JSON.stringify(Array.from(new Set(holdings.filter((holding) => holding.market === 'US' && holding.symbol !== 'CASH').map((holding) => holding.symbol))).sort().map((symbol) => ({ symbol, market: 'US' })));
  const load = useCallback(async (signal: AbortSignal, retry: boolean) => {
    const targets = JSON.parse(symbols) as Array<{ symbol: string; market: 'US' }>;
    if (targets.length === 0) return { fundamentals: {}, incomplete: false, today: new Date().toLocaleDateString('sv-SE') };
    const data = await fetchHomeJson<{ fundamentals: Record<string, FundamentalMetrics> }>('/api/fundamentals', signal, { symbols: targets, refresh: retry });
    if (!data.fundamentals) throw new Error('決算予定未取得');
    return { ...data, incomplete: targets.some((target) => !data.fundamentals[`${target.symbol}|US`]), today: new Date().toLocaleDateString('sv-SE') };
  }, [symbols]);
  const earnings = useHomeResource(load);
  const rows = earnings.data ? upcomingEarnings(holdings, earnings.data.fundamentals, earnings.data.today) : [];
  return <HomePanel title="決算予定（今後3週間）">
    {earnings.loading ? <PanelSkeleton /> : earnings.error ? <PanelError retry={earnings.retry} /> : <>
      {rows.length > 0 ? <table className="w-full table-fixed border-collapse" aria-label="今後3週間の決算予定"><tbody>
        {rows.map((row) => <tr key={row.symbol} className="border-b border-[var(--pm-divider)]" style={{ height: 'var(--pm-row-h)' }}>
          <td className="num w-[72px] px-2 !text-left"><time dateTime={row.date}>{new Date(`${row.date}T00:00:00Z`).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', weekday: 'short', timeZone: 'UTC' })}</time></td>
          <td className="w-16 truncate px-1 pm-muted" title={row.symbol}>{row.symbol}</td><td className="truncate px-2" title={row.name}>{row.name}</td>
        </tr>)}
      </tbody></table> : !earnings.data?.incomplete && <PanelEmpty>対象期間の決算予定はありません。</PanelEmpty>}
      {earnings.data?.incomplete && <PanelError retry={earnings.retry} />}
      <p className="px-2.5 py-2 text-[11px] pm-muted">米国株・日付取得済みの銘柄のみ</p>
    </>}
  </HomePanel>;
}
