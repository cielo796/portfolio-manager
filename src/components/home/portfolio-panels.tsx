'use client';

import Link from 'next/link';
import { useMemo, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { HoldingWithPrice, PortfolioSummary, SectorAllocation } from '@/types';
import { formatCurrency, formatPercent, getProfitLossColor } from '@/lib/utils';
import { formatHoldingCell, type HoldingColumnId, type HoldingRow } from '@/components/holdings/columns';
import { portfolioAllocation } from './home-data';
import { HomeAllocationDonut } from './allocation-donut';
import { AllocationDonut } from '@/components/charts/allocation-donut';
import { useHomeDesktop } from './home-layout';
import { AllocationTabs, type AllocationView } from '@/components/charts/allocation-tabs';
import { HomePanel, PanelEmpty, PanelError, PanelSkeleton } from './panel';
import { detailHref } from '@/components/detail/data';
import type { useHoldingContextMenu } from '@/components/holdings/use-holding-context-menu';

type HomeHoldingMenu = Pick<ReturnType<typeof useHoldingContextMenu>, 'openMenu' | 'activeRowId' | 'activeTarget'>;

function rowMenuProps(menu: HomeHoldingMenu, row: HoldingRow, panel: 'holdings' | 'movers') {
  const selected = menu.activeRowId === row.holding.id && menu.activeTarget?.dataset.holdingMenu === panel;
  return {
    tabIndex: 0,
    'data-holding-menu': panel,
    'aria-selected': selected,
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault(); event.stopPropagation();
      menu.openMenu(event.clientX, event.clientY, event.currentTarget, row);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
        event.preventDefault(); event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        menu.openMenu(rect.left + 16, rect.bottom, event.currentTarget, row);
      }
    },
  };
}

function HomeMenuArea({ menu, children }: { menu: HomeHoldingMenu; children: ReactNode }) {
  return <div tabIndex={-1} className="min-h-full" onContextMenu={(event) => {
    event.preventDefault(); event.stopPropagation();
    if ((event.target as HTMLElement).closest('[role="row"], tr')) return;
    menu.openMenu(event.clientX, event.clientY, event.currentTarget);
  }}>{children}</div>;
}

const COLUMNS: Array<[HoldingColumnId, string]> = [
  ['symbol', 'コード'], ['name', '銘柄名'], ['price', '現在値'], ['changePercent', '前日比%'],
  ['valueJpy', '評価額（円）'], ['profit', '評価損益'], ['profitPercent', '損益%'], ['weight', '構成比'],
];
const rowStyle = { gridTemplateColumns: '56px minmax(96px,190px) 78px 68px 100px 92px 68px minmax(56px,1fr)', minHeight: 'var(--pm-row-h)' };

function PortfolioState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  return loading ? <PanelSkeleton /> : error ? <PanelError retry={retry} /> : children;
}

type PortfolioStateProps = { loading: boolean; error: boolean; retry: () => void };

export function HomeHoldings({ rows, summary, menu, ...state }: PortfolioStateProps & { rows: HoldingRow[]; summary: PortfolioSummary; menu: HomeHoldingMenu }) {
  const total: Partial<Record<HoldingColumnId, string>> = {
    name: '合計', changePercent: formatPercent(summary.daily_change_percent), valueJpy: formatCurrency(summary.total_value_jpy),
    profit: formatCurrency(summary.total_profit_loss), profitPercent: formatPercent(summary.total_profit_loss_percent),
    weight: summary.total_value_jpy > 0 ? '100.0%' : '0.0%',
  };
  return <HomePanel title="保有銘柄" href="/portfolio" link="すべての列を表示">
    <HomeMenuArea menu={menu}>
      <PortfolioState {...state}>
        <div className="max-h-[360px] overflow-auto min-[1100px]:max-h-none min-[1100px]:overflow-visible">
          <div role="table" aria-label="保有銘柄" className="min-w-[620px]">
            <div role="row" className="sticky top-0 z-10 grid items-center border-b border-[var(--pm-border)] bg-[var(--pm-heading)] pm-muted" style={rowStyle}>
              {COLUMNS.map(([key, label], index) => <div key={key} role="columnheader" className={index > 1 ? 'num px-1' : 'px-1.5'}>{label}</div>)}
            </div>
            {rows.map((row) => <div key={row.holding.id} role="row" {...rowMenuProps(menu, row, 'holdings')} className="relative grid items-center border-b border-[var(--pm-divider)] hover:bg-[var(--pm-selected-row)] focus-within:bg-[var(--pm-selected-row)] aria-selected:bg-[var(--pm-selected-row)]" style={rowStyle}>
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
    </HomeMenuArea>
  </HomePanel>;
}

export function HomeMovers({ rows, menu, ...state }: PortfolioStateProps & { rows: HoldingRow[]; menu: HomeHoldingMenu }) {
  const movers = rows.filter((row) => row.holding.symbol !== 'CASH')
    .sort((a, b) => (b.holding.change_percent ?? -Infinity) - (a.holding.change_percent ?? -Infinity));
  return <HomePanel title="今日の騰落（保有）">
    <HomeMenuArea menu={menu}>
      <PortfolioState {...state}>
        <div className="max-h-[320px] overflow-auto min-[1100px]:max-h-none min-[1100px]:overflow-visible">
          <table className="w-full min-w-[280px] table-fixed border-collapse" aria-label="今日の騰落">
            <thead className="pm-muted"><tr style={{ height: 'var(--pm-row-h)' }}><th className="w-14 px-2 text-left font-normal">コード</th><th className="px-1 text-left font-normal">銘柄名</th><th className="num w-[78px] px-1 font-normal">前日比%</th><th className="num w-[90px] px-2 font-normal">当日損益</th></tr></thead>
            <tbody>{movers.map((row) => <tr key={row.holding.id} {...rowMenuProps(menu, row, 'movers')} className="border-t border-[var(--pm-divider)] aria-selected:bg-[var(--pm-selected-row)]" style={{ height: 'var(--pm-row-h)' }}>
              <td className="truncate px-2 pm-muted" title={row.holding.symbol}>{row.holding.symbol}</td><td className="truncate px-1" title={row.holding.name}><Link href={detailHref(row.holding)} className="text-[var(--pm-link)] hover:underline">{row.holding.name ?? row.holding.symbol}</Link></td>
              {(['changePercent', 'daily'] as const).map((key) => <td key={key} className={`num px-1 ${typeof row.values[key] === 'number' ? getProfitLossColor(row.values[key]) : 'pm-muted text-[10px]'}`}>{formatHoldingCell(row, key)}</td>)}
            </tr>)}</tbody>
          </table>
          {movers.length === 0 && <PanelEmpty>対象の保有銘柄がありません。</PanelEmpty>}
        </div>
      </PortfolioState>
    </HomeMenuArea>
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

export function HomeAllocation({ holdings, usdJpy, loading, error, retry }: PortfolioStateProps & {
  sectors?: SectorAllocation[];
  summary: PortfolioSummary;
  holdings: HoldingWithPrice[];
  usdJpy: number;
}) {
  const view = useSyncExternalStore(subscribeAllocationView, readAllocationView, () => 'holding' as const);
  const desktop = useHomeDesktop();
  const Donut = desktop ? HomeAllocationDonut : AllocationDonut;
  const data = useMemo(() => portfolioAllocation(holdings, usdJpy), [holdings, usdJpy]);
  const setView = (next: AllocationView) => {
    allocationViewMemory = next;
    try { window.localStorage.setItem(ALLOCATION_VIEW_KEY, next); } catch { /* 保存できなくても切替は有効にする。 */ }
    window.dispatchEvent(new Event(ALLOCATION_VIEW_EVENT));
  };
  const items = view === 'holding' ? data.holdingItems : view === 'sector' ? data.sectorItems : data.marketItems;
  return <HomePanel title="配分"><PortfolioState loading={loading} error={error} retry={retry}>
    <div className="p-2 min-[1100px]:flex min-[1100px]:h-full min-[1100px]:flex-col min-[1100px]:[&>[role=tabpanel]]:min-h-0 min-[1100px]:[&>[role=tabpanel]]:flex-1 min-[1100px]:[&>[role=tablist]]:shrink-0"><AllocationTabs view={view} onChange={setView} market>
      <Donut items={items} holdingCount={data.holdingCount} missingCount={data.missingCount} label={view === 'holding' ? '銘柄別配分' : view === 'sector' ? 'セクター別配分' : '市場別配分'} />
    </AllocationTabs></div>
  </PortfolioState></HomePanel>;
}
