'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { groupAllocationItems, type AllocationItem } from '@/components/charts/allocation-data';

type SliceLabelProps = { cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; payload?: AllocationItem };
function sliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, payload }: SliceLabelProps) {
  if (cx === undefined || cy === undefined || midAngle === undefined || innerRadius === undefined || outerRadius === undefined || !payload || payload.percent < 5) return null;
  const angle = -midAngle * Math.PI / 180;
  const radius = (innerRadius + outerRadius) / 2;
  return <text x={cx + radius * Math.cos(angle)} y={cy + radius * Math.sin(angle)} textAnchor="middle" dominantBaseline="central" fill="var(--pm-bg)" fontSize={11} fontWeight={600}>{formatNumber(payload.percent, 0)}%</text>;
}

function AllocationTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: AllocationItem }> }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return <div className="w-[168px] rounded border border-[var(--pm-border)] bg-[var(--pm-heading)] p-2 text-[11px] text-[var(--pm-text)] shadow-xl">
    <p className="break-words">{item.label}</p><p className="mt-1 tabular-nums">{formatCurrency(item.value)} · {formatNumber(item.percent, 1)}%</p>
  </div>;
}

// 他画面の固定サイズ表示を変えず、ホームだけ割当領域に追従させる。
export function HomeAllocationDonut({ items, holdingCount, missingCount = 0, label = '資産配分' }: {
  items: AllocationItem[]; holdingCount: number; missingCount?: number; label?: string;
}) {
  const data = groupAllocationItems(items);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return <div className="flex h-full min-h-0 min-w-0 flex-col text-[11px] text-[var(--pm-text)]">
    {data.length ? <>
      <div className="relative min-h-[168px] min-w-[168px] flex-1" role="img" aria-label={`${label}、合計評価額 ${formatCurrency(total)}、${holdingCount}銘柄`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 168, height: 168 }}>
          <PieChart accessibilityLayer>
            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius="58%" outerRadius="95%" startAngle={90} endAngle={-270} stroke="var(--pm-panel)" strokeWidth={1} labelLine={false} label={sliceLabel} isAnimationActive={false}>
              {data.map((item) => <Cell key={item.key} fill={item.color} />)}
            </Pie>
            <Tooltip content={<AllocationTooltip />} position={{ x: 0, y: 0 }} wrapperStyle={{ zIndex: 40 }} />
          </PieChart>
        </ResponsiveContainer>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="pm-muted text-[10px]">合計評価額</span>
          <span className="max-w-[96px] font-semibold tabular-nums" style={{ fontSize: formatCurrency(total).length > 13 ? 9 : 11 }}>{formatCurrency(total)}</span>
          <span className="pm-muted">{holdingCount}銘柄</span>
        </div>
      </div>
      <div className="max-h-[45%] min-h-8 shrink-0 overflow-auto" tabIndex={0} aria-label={`${label}の凡例`}>
        <table className="w-full min-w-[230px] table-fixed border-collapse" aria-label={`${label}の内訳`}>
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
    </> : <p className="p-3 pm-muted">配分を表示する資産がありません。</p>}
    {missingCount > 0 && <p className="mt-1 shrink-0 pm-muted">価格未取得 {missingCount}件を除外（取得済み評価額の構成比）</p>}
  </div>;
}
