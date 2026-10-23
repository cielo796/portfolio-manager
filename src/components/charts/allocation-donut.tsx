'use client';

import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { groupAllocationItems, type AllocationItem } from './allocation-data';

type SliceLabelProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  payload?: AllocationItem;
};

function sliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, payload }: SliceLabelProps) {
  if (cx === undefined || cy === undefined || midAngle === undefined || innerRadius === undefined || outerRadius === undefined || !payload || payload.percent < 5) return null;
  const angle = -midAngle * Math.PI / 180;
  const radius = (innerRadius + outerRadius) / 2;
  return <text x={cx + radius * Math.cos(angle)} y={cy + radius * Math.sin(angle)} textAnchor="middle" dominantBaseline="central" fill="var(--pm-bg)" fontSize={11} fontWeight={600}>
    {formatNumber(payload.percent, 0)}%
  </text>;
}

function AllocationTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: AllocationItem }> }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return <div className="w-[168px] rounded border border-[var(--pm-border)] bg-[var(--pm-heading)] p-2 text-[11px] text-[var(--pm-text)] shadow-xl">
    <p className="break-words">{item.label}</p>
    <p className="mt-1 tabular-nums">{formatCurrency(item.value)} · {formatNumber(item.percent, 1)}%</p>
  </div>;
}

export function AllocationDonut({ items, holdingCount, missingCount = 0, label = '資産配分' }: {
  items: AllocationItem[];
  holdingCount: number;
  missingCount?: number;
  label?: string;
}) {
  const data = groupAllocationItems(items);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return <div className="min-w-0 text-[11px] text-[var(--pm-text)]">
    {data.length > 0 ? <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <div className="relative h-[168px] w-[168px] shrink-0" role="img" aria-label={`${label}、合計評価額 ${formatCurrency(total)}、${holdingCount}銘柄`}>
        <PieChart width={168} height={168} accessibilityLayer>
          <Pie data={data} dataKey="value" nameKey="label" cx={84} cy={84} innerRadius={49} outerRadius={80} startAngle={90} endAngle={-270} stroke="var(--pm-panel)" strokeWidth={1} labelLine={false} label={sliceLabel} isAnimationActive={false}>
            {data.map((item) => <Cell key={item.key} fill={item.color} />)}
          </Pie>
          <Tooltip content={<AllocationTooltip />} position={{ x: 0, y: 0 }} wrapperStyle={{ zIndex: 40 }} />
        </PieChart>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="pm-muted text-[10px]">合計評価額</span>
          <span className="max-w-[96px] font-semibold tabular-nums" style={{ fontSize: formatCurrency(total).length > 13 ? 9 : 11 }}>{formatCurrency(total)}</span>
          <span className="pm-muted">{holdingCount}銘柄</span>
        </div>
      </div>
      <div className="max-h-[132px] min-w-0 flex-[1_1_230px] overflow-auto" tabIndex={0} aria-label={`${label}の凡例`}>
        <table className="w-full table-fixed border-collapse" aria-label={`${label}の内訳`}>
          <thead className="sticky top-0 bg-[var(--pm-panel)] pm-muted"><tr className="h-[22px]">
            <th className="px-1 text-left font-normal">名称</th><th className="w-12 px-1 text-right font-normal">割合</th><th className="w-[94px] px-1 text-right font-normal">評価額（円）</th>
          </tr></thead>
          <tbody>{data.map((item) => <tr key={item.key} className="h-[22px] border-t border-[var(--pm-divider)]">
            <td className="px-1" title={item.label}><span className="flex min-w-0 items-center gap-1.5"><span className="size-2 shrink-0 rounded-sm" style={{ background: item.color }} /><span className="truncate">{item.label}</span></span></td>
            <td className="whitespace-nowrap px-1 text-right tabular-nums">{formatNumber(item.percent, 1)}%</td>
            <td className="truncate whitespace-nowrap px-1 text-right tabular-nums" title={formatCurrency(item.value)}>{formatCurrency(item.value)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div> : <p className="p-3 pm-muted">配分を表示する資産がありません。</p>}
    {missingCount > 0 && <p className="mt-1 pm-muted">価格未取得 {missingCount}件を除外（取得済み評価額の構成比）</p>}
  </div>;
}
