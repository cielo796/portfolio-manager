'use client';

import { useMemo } from 'react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { HoldingsSummaryStrip } from '@/components/holdings/summary-strip';
import { createHoldingRows } from '@/components/holdings/columns';
import { HomeHoldings, HomeMovers, HomeAllocation } from '@/components/home/portfolio-panels';
import { HomeMarket } from '@/components/home/market-panel';
import { HomeEarnings } from '@/components/home/earnings-panel';
import { HomeNews } from '@/components/home/news-panel';
import { HomePanel, PanelError, PanelSkeleton } from '@/components/home/panel';

export default function HomePage() {
  const {
    portfolios, holdings, stockPrices, summary, sectorAllocation, exchangeRate,
    isLoading, isRefreshing, loadError, priceError, refreshPrices, reloadPortfolioData,
  } = usePortfolio();
  usePageRefresh(refreshPrices, isRefreshing, exchangeRate.updated_at, !isLoading && !loadError);
  const rows = useMemo(() => createHoldingRows(holdings, portfolios, stockPrices, exchangeRate.rate, summary.total_value_jpy),
    [holdings, portfolios, stockPrices, exchangeRate.rate, summary.total_value_jpy]);
  const state = { loading: isLoading, error: loadError, retry: () => { void reloadPortfolioData(); } };

  return <div className="flex min-w-0 flex-col gap-1 text-xs">
    {isLoading ? <section aria-label="資産サマリー" className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]"><PanelSkeleton /></section>
      : loadError ? <section aria-label="資産サマリー" className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]"><PanelError retry={state.retry} /></section>
      : <HoldingsSummaryStrip summary={summary} exchangeRate={exchangeRate} />}
    {priceError && <div className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]"><PanelError retry={() => { void refreshPrices().catch(() => {}); }} /></div>}
    <div className="grid min-w-0 grid-cols-1 gap-1 min-[900px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <HomeHoldings rows={rows} summary={summary} {...state} />
      <HomeMarket />
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-1 min-[600px]:grid-cols-2 min-[900px]:grid-cols-4">
      <HomeMovers rows={rows} {...state} />
      <HomeAllocation sectors={sectorAllocation} summary={summary} {...state} />
      {isLoading || loadError ? <HomePanel title="決算予定（今後3週間）">{isLoading ? <PanelSkeleton /> : <PanelError retry={state.retry} />}</HomePanel> : <HomeEarnings holdings={holdings} />}
      <HomeNews />
    </div>
  </div>;
}
