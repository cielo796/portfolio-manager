'use client';

import { useMemo, useState } from 'react';
import type { HoldingWithPrice } from '@/types';
import { AllocationDonut } from '@/components/charts/allocation-donut';
import { AllocationTabs, type AllocationView } from '@/components/charts/allocation-tabs';
import { portfolioAllocation } from '@/components/home/home-data';

export function HoldingsAllocationPopover({ holdings, usdJpy }: { holdings: HoldingWithPrice[]; usdJpy: number }) {
  const [view, setView] = useState<AllocationView>('holding');
  const data = useMemo(() => portfolioAllocation(holdings, usdJpy), [holdings, usdJpy]);
  return <details className="relative shrink-0" onKeyDown={(event) => {
    if (event.key === 'Escape') {
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }}>
    <summary className="pm-button list-none">構成</summary>
    <section aria-label="保有銘柄の構成" className="absolute right-0 top-8 z-30 max-h-[70vh] w-[480px] max-w-[calc(100vw-32px)] overflow-auto rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] p-2 shadow-xl">
      <p className="mb-2 text-[11px] pm-muted">一覧の絞り込みに連動 · 現金を除く銘柄数</p>
      <AllocationTabs view={view} onChange={setView}>
        <AllocationDonut items={view === 'holding' ? data.holdingItems : data.sectorItems} holdingCount={data.holdingCount} missingCount={data.missingCount} label={view === 'holding' ? '銘柄別配分' : 'セクター別配分'} />
      </AllocationTabs>
    </section>
  </details>;
}
