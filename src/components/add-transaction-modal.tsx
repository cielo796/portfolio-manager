'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Holding, TickerPreset } from '@/types';
import { RecordForm, type RecordInput } from '@/components/records/record-form';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TransactionFormData) => Promise<void> | void;
  portfolios: { id: string; name: string }[];
  tickerPresets: TickerPreset[];
  initial?: Partial<TransactionFormData>;
}

export type TransactionFormData = RecordInput;

export function AddTransactionModal({ isOpen, onClose, onSubmit, portfolios, tickerPresets, initial }: AddTransactionModalProps) {
  const [context, setContext] = useState<{ holdings: Holding[]; rate?: number }>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void fetch('/api/portfolio-data', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('保有情報を読み込めませんでした。');
      const data = await response.json();
      if (!cancelled) setContext({ holdings: data.holdings ?? [], rate: data.stockPrices?.['USDJPY|FX']?.price });
    }).catch((cause) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [isOpen]);
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/60" onClick={onClose} />
    <section role="dialog" aria-modal="true" aria-labelledby="add-record-title" className="relative max-h-[90vh] w-full max-w-sm overflow-auto rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] text-xs shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--pm-border)] px-3 py-2"><h2 id="add-record-title">売買・配当を記録</h2><button aria-label="閉じる" onClick={onClose}><X size={16} /></button></div>
      {context ? <RecordForm portfolios={portfolios} holdings={context.holdings} candidates={tickerPresets} currentRate={context.rate} initial={initial} onCancel={onClose} onSubmit={async (input) => {
        await onSubmit(input);
        onClose();
        window.location.reload();
      }} /> : <p className="p-3" role={error ? 'alert' : 'status'}>{error || '読み込み中…'}</p>}
    </section>
  </div>;
}
