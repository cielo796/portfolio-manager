'use client';

import Link from 'next/link';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { HoldingWithPrice, PortfolioSummary, SectorAllocation } from '@/types';
import { formatCurrency, formatPercent, getProfitLossColor } from '@/lib/utils';
import { formatHoldingCell, type HoldingColumnId, type HoldingRow } from '@/components/holdings/columns';
import { portfolioAllocation } from './home-data';
import { AllocationDonut } from '@/components/charts/allocation-donut';
import { AllocationTabs, type AllocationView } from '@/components/charts/allocation-tabs';
import { HomePanel, PanelEmpty, PanelError, PanelSkeleton } from './panel';
import { detailHref } from '@/components/detail/data';
import { HomeHistory } from './history-panel';

const COLUMNS: Array<[HoldingColumnId, string]> = [
  ['symbol', 'コード'], ['name', '銘柄名'], ['price', '現在値'], ['changePercent', '前日比%'],
  ['valueJpy', '評価額（円）'], ['profit', '評価損益'], ['profitPercent', '損益%'], ['weight', '構成比'],
];
const rowStyle = { gridTemplateColumns: '56px minmax(96px,190px) 78px 68px 100px 92px 68px minmax(56px,1fr)', minHeight: 'var(--pm-row-h)' };

function PortfolioState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  return loading ? <PanelSkeleton /> : error ? <PanelError retry={retry} /> : children;
}

type PortfolioStateProps = { loading: boolean; error: boolean; retry: () => void };

export function HomeHoldings({ rows, summary, ...state }: PortfolioStateProps & { rows: HoldingRow[]; summary: PortfolioSummary }) {
  const total: Partial<Record<HoldingColumnId, string>> = {
    name: '合計', changePercent: formatPercent(summary.daily_change_percent), valueJpy: formatCurrency(summary.total_value_jpy),
    profit: formatCurrency(summary.total_profit_loss), profitPercent: formatPercent(summary.total_profit_loss_percent),
    weight: summary.total_value_jpy > 0 ? '100.0%' : '0.0%',
  };
  return <HomePanel title="保有銘柄" href="/portfolio" link="すべての列を表示">
    <PortfolioState {...state}>
      <div className="max-h-[360px] overflow-x-auto overflow-y-auto">
        <div role="table" aria-label="保有銘柄" className="min-w-[620px]">
          <div role="row" className="sticky top-0 z-10 grid items-center border-b border-[var(--pm-border)] bg-[var(--pm-heading)] pm-muted" style={rowStyle}>
            {COLUMNS.map(([key, label], index) => <div key={key} role="columnheader" className={index > 1 ? 'num px-1' : 'px-1.5'}>{label}</div>)}
          </div>
          {rows.map((row) => <div key={row.holding.id} role="row" className="relative grid items-center border-b border-[var(--pm-divider)] hover:bg-[var(--pm-selected-row)] focus-within:bg-[var(--pm-selected-row)]" style={rowStyle}>
            {COLUMNS.map(([key], index) => {
              const text = formatHoldingCell(row, key);
              const value = row.values[key];
              const signed = ['changePercent', 'profit', 'profitPercent'].includes(key);
              return <div key={key} role="cell" title={text} className={`${index > 1 ? 'num whitespace-nowrap px-1' : 'min-w-0 truncate px-1.5'} ${signed && typeof value === 'number' ? getProfitLossColor(value) : ''} ${text === '価格未取得' ? 'pm-muted text-[10px]' : ''}`}>
                {key === 'symbol' ? <Link href={`/portfolio?symbol=${encodeURIComponent(row.holding.symbol)}&market=${row.holding.market}`} aria-label={`${row.holding.symbol} ${row.holding.name ?? ''}の保有詳細`} className="text-[var(--pm-link)] after:absolute after:inset-0">{text}</Link> : key === 'name' && row.holding.symbol !== 'CASH' ? <Link href={detailHref(row.holding)} className="relative z-[1] text-[var(--pm-link)] hover:underline">{text}</Link> : text}
              </div>;
            })}
          </div>)}
          <div role="row" className="grid items-center bg-[var(--pm-heading)] font-semibold" style={rowStyle}>
            {COLUMNS.map(([key], index) => <div key={key} role="cell" className={`${index > 1 ? 'num whitespace-nowrap px-1' : 'min-w-0 truncate px-1.5'} ${key === 'profit' || key === 'profitPercent' ? getProfitLossColor(summary.total_profit_loss) : key === 'changePercent' ? getProfitLossColor(summary.daily_change) : ''}`}>{total[key]}</div>)}
          </div>
        </div>
      </div>
      {rows.length === 0 && <PanelEmpty>保有銘柄がありません。</PanelEmpty>}
    </PortfolioState>
  </HomePanel>;
}

export function HomeMovers({ rows, ...state }: PortfolioStateProps & { rows: HoldingRow[] }) {
  const movers = rows.filter((row) => row.holding.symbol !== 'CASH')
    .sort((a, b) => (b.holding.change_percent ?? -Infinity) - (a.holding.change_percent ?? -Infinity));
  return <HomePanel title="今日の騰落（保有）">
    <PortfolioState {...state}>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full min-w-[280px] table-fixed border-collapse" aria-label="今日の騰落">
          <thead className="pm-muted"><tr style={{ height: 'var(--pm-row-h)' }}><th className="w-14 px-2 text-left font-normal">コード</th><th className="px-1 text-left font-normal">銘柄名</th><th className="num w-[78px] px-1 font-normal">前日比%</th><th className="num w-[90px] px-2 font-normal">当日損益</th></tr></thead>
          <tbody>{movers.map((row) => <tr key={row.holding.id} className="border-t border-[var(--pm-divider)]" style={{ height: 'var(--pm-row-h)' }}>
            <td className="truncate px-2 pm-muted" title={row.holding.symbol}>{row.holding.symbol}</td><td className="truncate px-1" title={row.holding.name}><Link href={detailHref(row.holding)} className="text-[var(--pm-link)] hover:underline">{row.holding.name ?? row.holding.symbol}</Link></td>
            {(['changePercent', 'daily'] as const).map((key) => <td key={key} className={`num px-1 ${typeof row.values[key] === 'number' ? getProfitLossColor(row.values[key]) : 'pm-muted text-[10px]'}`}>{formatHoldingCell(row, key)}</td>)}
          </tr>)}</tbody>
        </table>
        {movers.length === 0 && <PanelEmpty>対象の保有銘柄がありません。</PanelEmpty>}
      </div>
    </PortfolioState>
  </HomePanel>;
}

const ALLOCATION_VIEW_KEY = 'pm.home.allocationView';
const ALLOCATION_VIEW_EVENT = 'pm-home-allocation-view';
let allocationViewMemory: AllocationView | null = null;

function readAllocationView(): AllocationView {
  if (allocationViewMemory !== null) return allocationViewMemory;
  try {
    const value = window.localStorage.getItem(ALLOCATION_VIEW_KEY);
    return value === 'sector' || value === 'market' ? value : 'holding';
  } catch { return 'holding'; }
}

function subscribeAllocationView(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ALLOCATION_VIEW_KEY || event.key === null) { allocationViewMemory = null; callback(); }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(ALLOCATION_VIEW_EVENT, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(ALLOCATION_VIEW_EVENT, callback);
  };
}

export function HomeAllocation({ summary, holdings, usdJpy, loading, error, retry }: PortfolioStateProps & {
  sectors?: SectorAllocation[];
  summary: PortfolioSummary;
  holdings: HoldingWithPrice[];
  usdJpy: number;
}) {
  const view = useSyncExternalStore(subscribeAllocationView, readAllocationView, () => 'holding' as const);
  const data = useMemo(() => portfolioAllocation(holdings, usdJpy), [holdings, usdJpy]);
  const setView = (next: AllocationView) => {
    allocationViewMemory = next;
    try { window.localStorage.setItem(ALLOCATION_VIEW_KEY, next); } catch { /* 保存できなくても切替は有効にする。 */ }
    window.dispatchEvent(new Event(ALLOCATION_VIEW_EVENT));
  };
  const items = view === 'holding' ? data.holdingItems : view === 'sector' ? data.sectorItems : data.marketItems;
  return <div className="min-w-0 space-y-1"><HomePanel title="配分"><PortfolioState loading={loading} error={error} retry={retry}>
    <div className="p-2"><AllocationTabs view={view} onChange={setView} market>
      <AllocationDonut items={items} holdingCount={data.holdingCount} missingCount={data.missingCount} label={view === 'holding' ? '銘柄別配分' : view === 'sector' ? 'セクター別配分' : '市場別配分'} />
    </AllocationTabs></div>
  </PortfolioState></HomePanel>{!loading && !error && <HomeHistory revision={summary.total_value_jpy} />}</div>;
}
