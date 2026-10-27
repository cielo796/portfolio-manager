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
import { HomeLayout } from '@/components/home/home-layout';
import { HomeHistory } from '@/components/home/history-panel';

export default function HomePage() {
  const {
    portfolios, holdings, stockPrices, summary, sectorAllocation, exchangeRate,
    isLoading, isRefreshing, loadError, priceError, refreshPrices, reloadPortfolioData,
  } = usePortfolio();
  usePageRefresh(refreshPrices, isRefreshing, exchangeRate.updated_at, !isLoading && !loadError);
  const rows = useMemo(() => createHoldingRows(holdings, portfolios, stockPrices, exchangeRate.rate, summary.total_value_jpy),
    [holdings, portfolios, stockPrices, exchangeRate.rate, summary.total_value_jpy]);
  const state = { loading: isLoading, error: loadError, retry: () => { void reloadPortfolioData(); } };

  return <HomeLayout summary={isLoading ? <section aria-label="資産サマリー" className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]"><PanelSkeleton /></section>
      : loadError ? <section aria-label="資産サマリー" className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]"><PanelError retry={state.retry} /></section>
      : <HoldingsSummaryStrip summary={summary} exchangeRate={exchangeRate} />}
    notice={priceError && <div className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]"><PanelError retry={() => { void refreshPrices().catch(() => {}); }} /></div>}
    holdings={<HomeHoldings rows={rows} summary={summary} {...state} />}
    market={<HomeMarket />}
    movers={<HomeMovers rows={rows} {...state} />}
    allocation={<HomeAllocation sectors={sectorAllocation} summary={summary} holdings={holdings} usdJpy={exchangeRate.rate} {...state} />}
    history={isLoading || loadError ? <div className="hidden h-full min-[1100px]:block"><HomePanel title="資産推移（直近3か月）">{isLoading ? <PanelSkeleton /> : <PanelError retry={state.retry} />}</HomePanel></div> : <HomeHistory revision={summary.total_value_jpy} />}
    earnings={isLoading || loadError ? <HomePanel title="決算予定（今後3週間）">{isLoading ? <PanelSkeleton /> : <PanelError retry={state.retry} />}</HomePanel> : <HomeEarnings holdings={holdings} />}
    news={<HomeNews />}
  />;
}
