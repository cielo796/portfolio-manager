import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PortfolioSummary, SectorAllocation } from '@/types';
import { formatCurrency, formatNumber, formatPercent, getProfitLossColor } from '@/lib/utils';
import { formatHoldingCell, type HoldingColumnId, type HoldingRow } from '@/components/holdings/columns';
import { marketAllocation } from './home-data';
import { HomePanel, PanelEmpty, PanelError, PanelSkeleton } from './panel';
import { detailHref } from '@/components/detail/data';

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

function AllocationBar({ label, items }: { label: string; items: Array<{ label: string; percent: number; color: string }> }) {
  return <div className="space-y-2">
    <h3 className="pm-muted text-[11px]">{label}</h3>
    <div className="flex h-2.5 overflow-hidden rounded-sm bg-[var(--pm-heading)]" role="img" aria-label={`${label} ${items.map((item) => `${item.label} ${formatNumber(item.percent, 1)}%`).join('、')}`}>
      {items.map((item) => <span key={item.label} title={`${item.label} ${formatNumber(item.percent, 1)}%`} style={{ width: `${item.percent}%`, background: item.color }} />)}
    </div>
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
      {items.map((item) => <li key={item.label} className="flex min-w-0 items-center gap-1.5"><span className="size-2 shrink-0 rounded-sm" style={{ background: item.color }} /><span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span><span className="num">{formatNumber(item.percent, 1)}%</span></li>)}
    </ul>
  </div>;
}

export function HomeAllocation({ sectors, summary, ...state }: PortfolioStateProps & { sectors: SectorAllocation[]; summary: PortfolioSummary }) {
  return <HomePanel title="配分"><PortfolioState {...state}>
    {summary.total_value_jpy > 0 ? <div className="space-y-3 p-2.5"><AllocationBar label="セクター別" items={sectors.filter((sector) => sector.value > 0)} /><AllocationBar label="市場別" items={marketAllocation(summary)} /></div> : <PanelEmpty>配分を表示する資産がありません。</PanelEmpty>}
  </PortfolioState></HomePanel>;
}
