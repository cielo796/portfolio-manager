'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useTickerPresets } from '@/hooks/use-ticker-presets';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { AddHoldingModal } from '@/components/add-holding-modal';
import { AddTransactionModal } from '@/components/add-transaction-modal';
import { EditHoldingModal } from '@/components/edit-holding-modal';
import { createHoldingRows } from '@/components/holdings/columns';
import { HoldingsSummaryStrip } from '@/components/holdings/summary-strip';
import { HoldingsWorkspace } from '@/components/holdings/holdings-workspace';

export default function PortfolioPage() {
  return <Suspense fallback={<p role="status" className="p-3 pm-muted">読み込み中...</p>}><PortfolioContent /></Suspense>;
}

function PortfolioContent() {
  const params = useSearchParams();
  const selectedSymbol = params.get('symbol');
  const selectedMarket = params.get('market');
  const {
    portfolios, holdings, stockPrices, summary, exchangeRate, isLoading, isRefreshing,
    refreshPrices, addHolding, addTransaction, updateHolding, removeHolding, reorderHoldings,
  } = usePortfolio();
  const { tickerPresets } = useTickerPresets();
  usePageRefresh(refreshPrices, isRefreshing, exchangeRate.updated_at, !isLoading);
  const [adding, setAdding] = useState(false);
  const [recording, setRecording] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [error, setError] = useState('');
  const rows = useMemo(() => createHoldingRows(holdings, portfolios, stockPrices, exchangeRate.rate, summary.total_value_jpy),
    [holdings, portfolios, stockPrices, exchangeRate.rate, summary.total_value_jpy]);

  const save = async (action: () => Promise<void>) => {
    setError('');
    try { await action(); } catch (cause) {
      setError('変更の保存に失敗しました。もう一度お試しください。');
      throw cause;
    }
  };

  if (isLoading) return <div role="status" className="flex min-h-full items-center justify-center pm-muted">読み込み中...</div>;

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-1 min-[900px]:h-full">
      <HoldingsSummaryStrip summary={summary} exchangeRate={exchangeRate} />
      {error && <p role="alert" className="shrink-0 text-[var(--pm-accent)]">{error}</p>}
      <HoldingsWorkspace key={`${selectedSymbol}|${selectedMarket}`} initialSelectedId={rows.find((row) => row.holding.symbol === selectedSymbol && row.holding.market === selectedMarket)?.holding.id} rows={rows} usdJpy={exchangeRate.rate} total={summary.total_value_jpy}
        onAdd={() => setAdding(true)} onRecord={() => setRecording(true)}
        onEdit={(row) => setEditingId(row.holding.id)}
        onClosePosition={(row) => removeHolding(row.holding.id)}
        onSaveMemo={(row, memo) => updateHolding(row.holding.id, { memo })}
        onReorder={reorderHoldings} />
      {adding && <AddHoldingModal isOpen onClose={() => setAdding(false)} onSubmit={(data) => save(() => addHolding(data))} portfolios={portfolios} tickerPresets={tickerPresets} />}
      {recording && <AddTransactionModal isOpen onClose={() => setRecording(false)} onSubmit={(data) => save(() => addTransaction(data))} portfolios={portfolios} tickerPresets={tickerPresets} />}
      {editingId && <EditHoldingModal isOpen holding={holdings.find((holding) => holding.id === editingId) ?? null}
        onClose={() => setEditingId(undefined)} onSave={(id, data) => save(() => updateHolding(id, data))}
        onClosePosition={(id) => save(() => removeHolding(id))} />}
    </div>
  );
}
