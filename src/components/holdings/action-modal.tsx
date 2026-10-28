'use client';

import { useState } from 'react';
import type { Portfolio, TickerPreset, TransactionType } from '@/types';
import { AddHoldingModal } from '@/components/add-holding-modal';
import { AddTransactionModal } from '@/components/add-transaction-modal';
import { useDetailResource } from '@/components/detail/data';
import { ConfirmDialog } from '@/components/shell/confirm-dialog';
import type { HoldingRow } from './columns';

export function HoldingActionModal({ mode, row, onClose }: { mode: 'add' | TransactionType; row: HoldingRow; onClose: () => void }) {
  const portfolio = useDetailResource<{ portfolios: Portfolio[] }>('/api/portfolio-data');
  const tickers = useDetailResource<{ tickerPresets: TickerPreset[] }>('/api/tickers');
  const [error, setError] = useState('');
  if (portfolio.error || tickers.error || !portfolio.data || !tickers.data) return <ConfirmDialog title="入力フォーム" confirmLabel="再読み込み" disabled={portfolio.loading || tickers.loading}
    onClose={onClose} onConfirm={() => { void portfolio.reload(); void tickers.reload(); }}>
    <p role={portfolio.error || tickers.error ? 'alert' : 'status'}>{portfolio.error || tickers.error || '読み込み中…'}</p>
  </ConfirmDialog>;
  const submit = async (url: string, input: unknown) => {
    setError('');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '保存できませんでした。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
      throw cause;
    }
  };
  const { holding } = row;
  return <>
    {mode === 'add' ? <AddHoldingModal isOpen portfolios={portfolio.data.portfolios} tickerPresets={tickers.data.tickerPresets}
      initial={{ symbol: holding.symbol, market: holding.market, name: holding.name, sector: holding.sector,
        portfolio_id: portfolio.data.portfolios.find((item) => item.id !== holding.portfolio_id)?.id ?? holding.portfolio_id }}
      onClose={onClose} onSubmit={async (input) => { await submit('/api/holdings', input); window.location.reload(); }} />
      : <AddTransactionModal isOpen portfolios={portfolio.data.portfolios} tickerPresets={tickers.data.tickerPresets}
        initial={{ portfolio_id: holding.portfolio_id, symbol: holding.symbol, market: holding.market, name: holding.name,
          type: mode, shares: mode === 'sell' ? holding.shares : 0, price: holding.current_price ?? 0 }}
        onClose={onClose} onSubmit={(input) => submit('/api/transactions', input)} />}
    {error && <p role="alert" className="fixed bottom-4 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] p-3 text-xs text-[#ff5c5c]">{error}</p>}
  </>;
}
