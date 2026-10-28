'use client';

import { useMemo, useState } from 'react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useTickerPresets } from '@/hooks/use-ticker-presets';
import { AddHoldingModal } from '@/components/add-holding-modal';
import { EditHoldingModal } from '@/components/edit-holding-modal';
import { useHoldingContextMenu } from '@/components/holdings/use-holding-context-menu';
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
    addHolding, updateHolding, removeHolding,
  } = usePortfolio();
  const { tickerPresets } = useTickerPresets();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const menu = useHoldingContextMenu({ variant: 'home', onAdd: () => setAdding(true),
    onEdit: (row) => setEditingId(row.holding.id),
    onDelete: (row) => save(() => removeHolding(row.holding.id)),
  });
  const save = async (action: () => Promise<void>) => {
    menu.setError('');
    try { await action(); await reloadPortfolioData(); } catch (cause) {
      menu.setError('変更の保存に失敗しました。もう一度お試しください。');
      throw cause;
    }
  };
  usePageRefresh(refreshPrices, isRefreshing, exchangeRate.updated_at, !isLoading && !loadError);
  const rows = useMemo(() => createHoldingRows(holdings, portfolios, stockPrices, exchangeRate.rate, summary.total_value_jpy),
    [holdings, portfolios, stockPrices, exchangeRate.rate, summary.total_value_jpy]);
  const state = { loading: isLoading, error: loadError, retry: () => { void reloadPortfolioData(); } };

  return <><HomeLayout summary={isLoading ? <section aria-label="資産サマリー" className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]"><PanelSkeleton /></section>
      : loadError ? <section aria-label="資産サマリー" className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]"><PanelError retry={state.retry} /></section>
      : <HoldingsSummaryStrip summary={summary} exchangeRate={exchangeRate} />}
    notice={(priceError || menu.errorElement) && <>{priceError && <div className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]"><PanelError retry={() => { void refreshPrices().catch(() => {}); }} /></div>}{menu.errorElement}</>}
    holdings={<HomeHoldings rows={rows} summary={summary} menu={menu} {...state} />}
    market={<HomeMarket />}
    movers={<HomeMovers rows={rows} menu={menu} {...state} />}
    allocation={<HomeAllocation sectors={sectorAllocation} summary={summary} holdings={holdings} usdJpy={exchangeRate.rate} {...state} />}
    history={isLoading || loadError ? <div className="hidden h-full min-[1100px]:block"><HomePanel title="資産推移（直近3か月）">{isLoading ? <PanelSkeleton /> : <PanelError retry={state.retry} />}</HomePanel></div> : <HomeHistory revision={summary.total_value_jpy} />}
    earnings={isLoading || loadError ? <HomePanel title="決算予定（今後3週間）">{isLoading ? <PanelSkeleton /> : <PanelError retry={state.retry} />}</HomePanel> : <HomeEarnings holdings={holdings} />}
    news={<HomeNews />}
  />
    {menu.element}
    {adding && <AddHoldingModal isOpen onClose={() => setAdding(false)} onSubmit={(data) => save(() => addHolding(data))} portfolios={portfolios} tickerPresets={tickerPresets} />}
    {editingId && <EditHoldingModal isOpen holding={holdings.find((holding) => holding.id === editingId) ?? null}
      onClose={() => setEditingId(undefined)} onSave={(id, data) => save(() => updateHolding(id, data))}
      onClosePosition={(id) => save(() => removeHolding(id))} />}
  </>;
}
